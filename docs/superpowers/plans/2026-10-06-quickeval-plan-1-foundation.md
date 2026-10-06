# QuickEval Plan 1: Foundation, Classes, Students — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 10 must run in the main session, not in a subagent:** every outward step needs the user's explicit yes, and some steps are clicks the user makes in the Cloudflare dashboard.

**Goal:** The teacher logs in at `https://<project>.pages.dev/admin/` with Cloudflare Access and manages her school years, classes, and students on the live site.

**Architecture:** One repo with a Vite multi-page React + TypeScript front end (landing page at `/`, teacher app at `/admin/`), a Hono API served by Cloudflare Pages Functions at `/api/*`, and a D1 database. Pure rules live in `shared/` and are used by both sides. API tests run the real Hono app in Node against wrangler's local D1 engine.

**Tech Stack:** Node 24, npm 11, TypeScript 7, React 19, React Router 8, TanStack Query 5, Vite 8, Vitest 5 (jsdom + Testing Library), Hono 4, zod 4, wrangler 4 (Pages, D1, `getPlatformProxy`).

**Spec:** `docs/superpowers/specs/2026-10-06-quickeval-design.md` (sections §3–§7, §9, §15–§19 apply to this plan).

## Global Constraints

- Node 24 (`.node-version`), npm 11. After the first `npm install`, run `npm approve-scripts workerd esbuild` (npm blocks install scripts by default). Never hand-write the version-pinned `allowScripts` keys.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments, and docs are English. No page tells students that AI grades their work.
- API errors are `{ "error": "<code>", "message": "<Romanian text>" }`, made with `ApiError(status, code, message)`.
- Every teacher query is scoped by the logged-in teacher's id.
- Times are stored as ISO 8601 UTC strings. School year Y = September of Y to August of Y+1, Europe/Bucharest time.
- Functions do no heavy CPU work and make at most 15 D1 queries per request. Adding students uses a fixed number of queries.
- `public/_redirects` uses the directory form `/admin/* /admin/ 200`. `public/_routes.json` sends only `/api/*` to Functions.
- The Vite dev proxy keeps the Host header (`changeOrigin: false`).
- API tests use wrangler's `getPlatformProxy`. No direct `miniflare` dependency.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers.
- Development happens on Windows (commands below work in Git Bash and in PowerShell unless a step says otherwise). CI runs on Linux.
- Run every command from the repo root `D:\Projects\QuickEval`.

---

### Task 1: Project setup and shared rules

The repo gets its tooling and the first pure rules: school year, class names, student names.

**Files:**
- Create: `package.json`, `.gitignore`, `.node-version`, `tsconfig.json`, `vitest.config.ts`, `src/test/setup.ts`
- Create: `shared/schoolYear.ts`, `shared/classes.ts`, `shared/students.ts`
- Test: `shared/schoolYear.test.ts`, `shared/classes.test.ts`, `shared/students.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `schoolYearOf(date: Date): number`, `formatSchoolYear(year: number): string` ("2026-2027"), `isValidSchoolYear(year: number): boolean` (integer 2020–2100) in `shared/schoolYear.ts`.
  - `normalizeClassName(raw: string): string | null`, `displayClassName(name: string): string` ("Clasa 6E2"), `compareClassNames(a, b): number` in `shared/classes.ts`.
  - `MAX_NAME_LENGTH = 80`, `MAX_NAMES_PER_REQUEST = 60`, `cleanStudentName(raw): string`, `parseStudentNames(text): string[]`, `compareStudentNames(a, b): number` in `shared/students.ts`.
  - npm scripts used by later tasks: `dev:web`, `dev:api`, `preview`, `db:local`, `typecheck`, `test`, `build`, `smoke`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "quickeval",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev:web": "vite",
    "dev:api": "wrangler pages dev public --port 8788 --ip 127.0.0.1",
    "preview": "npm run build && wrangler pages dev dist --port 8788 --ip 127.0.0.1",
    "db:local": "wrangler d1 migrations apply quickeval --local && wrangler d1 execute quickeval --local --file scripts/seed-local.sql",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "build": "tsc -p tsconfig.json && vite build",
    "smoke": "node scripts/smoke.mjs"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.104.1",
    "hono": "^4.13.13",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-router": "^8.4.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^5.20261006.1",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.7",
    "@types/node": "^24.19.1",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.2",
    "jsdom": "^30.1.2",
    "typescript": "^7.0.2",
    "vite": "^8.3.3",
    "vitest": "^5.0.3",
    "wrangler": "^4.147.0"
  }
}
```

- [ ] **Step 2: Install the packages and allow their install scripts**

Run: `npm install` and then `npm approve-scripts workerd esbuild`
Expected: npm prints `added … packages`, then `Approved workerd` and `Approved esbuild`. `package.json` now ends with an `"allowScripts"` block that names the two packages with their exact versions. Keep that block.

- [ ] **Step 3: Create `.gitignore`**

```text
node_modules/
dist/
.wrangler/
.dev.vars
*.log
coverage/
```

- [ ] **Step 4: Create `.node-version`**

```text
24
```

- [ ] **Step 5: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "types": ["node", "vite/client"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "server", "functions", "shared", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

Two test projects: "web" (React code, jsdom) and "node" (shared code and the API).

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['shared/**/*.test.ts', 'server/**/*.test.ts'],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
```

- [ ] **Step 7: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 8: Create `shared/schoolYear.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatSchoolYear, isValidSchoolYear, schoolYearOf } from './schoolYear.ts';

describe('schoolYearOf', () => {
  it('puts October in the school year that started that September', () => {
    expect(schoolYearOf(new Date('2026-10-06T08:00:00Z'))).toBe(2026);
  });

  it('puts March in the school year that started the year before', () => {
    expect(schoolYearOf(new Date('2027-03-01T08:00:00Z'))).toBe(2026);
  });

  it('switches at midnight Romania time, not UTC', () => {
    // 2026-08-31 21:30 UTC is 2026-09-01 00:30 in Bucharest (UTC+3 in summer).
    expect(schoolYearOf(new Date('2026-08-31T21:30:00Z'))).toBe(2026);
    // 2026-08-31 20:00 UTC is still 23:00 on 31 August in Bucharest.
    expect(schoolYearOf(new Date('2026-08-31T20:00:00Z'))).toBe(2025);
  });
});

describe('formatSchoolYear', () => {
  it('shows both calendar years', () => {
    expect(formatSchoolYear(2026)).toBe('2026-2027');
  });
});

describe('isValidSchoolYear', () => {
  it('accepts whole years from 2020 to 2100', () => {
    expect(isValidSchoolYear(2026)).toBe(true);
    expect(isValidSchoolYear(2019)).toBe(false);
    expect(isValidSchoolYear(2026.5)).toBe(false);
    expect(isValidSchoolYear(Number.NaN)).toBe(false);
  });
});
```

- [ ] **Step 9: Create `shared/classes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { compareClassNames, displayClassName, normalizeClassName } from './classes.ts';

describe('normalizeClassName', () => {
  it('removes spaces and makes the name uppercase', () => {
    expect(normalizeClassName(' 6 e2 ')).toBe('6E2');
    expect(normalizeClassName('11R1')).toBe('11R1');
  });

  it('refuses empty, too long, or non-Latin names', () => {
    expect(normalizeClassName('   ')).toBeNull();
    expect(normalizeClassName('123456789')).toBeNull();
    expect(normalizeClassName('6-E2')).toBeNull();
    expect(normalizeClassName('6Ă')).toBeNull();
  });
});

describe('displayClassName', () => {
  it('adds the Romanian word for class', () => {
    expect(displayClassName('6E2')).toBe('Clasa 6E2');
  });
});

describe('compareClassNames', () => {
  it('orders numbers inside names as numbers', () => {
    expect(['11R1', '9R2', '6E2'].sort(compareClassNames)).toEqual(['6E2', '9R2', '11R1']);
  });
});
```

- [ ] **Step 10: Create `shared/students.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { cleanStudentName, compareStudentNames, parseStudentNames } from './students.ts';

describe('cleanStudentName', () => {
  it('trims and joins inner spaces', () => {
    expect(cleanStudentName('  Popescu   Ana  ')).toBe('Popescu Ana');
  });

  it('drops a leading list number', () => {
    expect(cleanStudentName('1. Popescu Ana')).toBe('Popescu Ana');
    expect(cleanStudentName('12) Ionescu Dan')).toBe('Ionescu Dan');
    expect(cleanStudentName('3\tMarin Ioana')).toBe('Marin Ioana');
  });
});

describe('parseStudentNames', () => {
  it('reads one name per line and skips empty lines', () => {
    expect(parseStudentNames('Popescu Ana\r\n\n  2. Ionescu Dan \n')).toEqual(['Popescu Ana', 'Ionescu Dan']);
  });

  it('keeps two students with the same name', () => {
    expect(parseStudentNames('Pop Ion\nPop Ion')).toEqual(['Pop Ion', 'Pop Ion']);
  });
});

describe('compareStudentNames', () => {
  it('uses Romanian alphabetical order', () => {
    expect(['Ștefan Ana', 'Sandu Ion', 'Tudor Ema'].sort(compareStudentNames)).toEqual([
      'Sandu Ion',
      'Ștefan Ana',
      'Tudor Ema',
    ]);
  });
});
```

- [ ] **Step 11: Run the tests to see them fail**

Run: `npx vitest run --project node`
Expected: FAIL. All 3 test files fail with `Error: Cannot find module './schoolYear.ts'` (and the same for `./classes.ts` and `./students.ts`): the modules do not exist yet. `Test Files  3 failed (3)`.

- [ ] **Step 12: Create `shared/schoolYear.ts`**

```ts
const TIME_ZONE = 'Europe/Bucharest';

// September-December of year Y and January-August of year Y+1 form school year Y.
// The month is read in Romania's time zone, so the switch happens at local midnight.
export function schoolYearOf(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return month >= 9 ? year : year - 1;
}

export function formatSchoolYear(year: number): string {
  return `${year}-${year + 1}`;
}

export function isValidSchoolYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2020 && year <= 2100;
}
```

- [ ] **Step 13: Create `shared/classes.ts`**

```ts
const CLASS_NAME = /^[A-Z0-9]{1,8}$/;

// "6e2", " 6 E2 " and "6E2" all become "6E2". Returns null when the result is
// not 1-8 Latin letters and digits: the name becomes part of test codes and URLs.
export function normalizeClassName(raw: string): string | null {
  const name = raw.replace(/\s+/g, '').toUpperCase();
  return CLASS_NAME.test(name) ? name : null;
}

export function displayClassName(name: string): string {
  return `Clasa ${name}`;
}

// Sorts "6E2" before "11R1": numbers inside names compare as numbers.
export function compareClassNames(a: string, b: string): number {
  return a.localeCompare(b, 'ro', { numeric: true });
}
```

- [ ] **Step 14: Create `shared/students.ts`**

```ts
export const MAX_NAME_LENGTH = 80;
export const MAX_NAMES_PER_REQUEST = 60;

// Trims the name, joins inner whitespace into single spaces, and drops a
// leading list number such as "1. ", "2) " or "3 " (catalog lists are numbered).
export function cleanStudentName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+[.)]?\s+/, '');
}

// One name per line. Empty lines are skipped.
export function parseStudentNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(cleanStudentName)
    .filter((name) => name.length > 0);
}

// Romanian alphabetical order: "Ștefan" sorts after "Sandu".
export function compareStudentNames(a: string, b: string): number {
  return a.localeCompare(b, 'ro');
}
```

- [ ] **Step 15: Run the tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  3 passed (3)`, `Tests  14 passed (14)`.

- [ ] **Step 16: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 17: Commit**

```bash
git add package.json package-lock.json .gitignore .node-version tsconfig.json vitest.config.ts src/test/setup.ts shared
git commit -m "Set up the project and the shared school-year, class and student rules"
```

---

### Task 2: API skeleton, D1 schema, and the API test helper

The API answers JSON (including a JSON 404), the first migration creates the people tables, and tests can start a fresh local D1 database.

**Files:**
- Create: `wrangler.toml`, `migrations/0001_people.sql`
- Create: `server/env.ts`, `server/errors.ts`, `server/http.ts`, `server/app.ts`, `functions/api/[[route]].ts`
- Create: `server/test/testApi.ts`
- Test: `server/app.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 except the tooling.
- Produces:
  - `interface Env { DB: D1Database; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; DEV_TEACHER_EMAIL?: string }` and `interface AppEnv { Bindings: Env }` in `server/env.ts` (Task 3 adds `Variables`).
  - `class ApiError extends Error { status; code }` with `new ApiError(status, code, message)`, `notFound(): ApiError`, `isUniqueViolation(err: unknown): boolean` in `server/errors.ts`.
  - `readJson(c, schema)` (415 when not JSON, 400 with the schema's Romanian message), `parseId(raw): number` (404 when not a positive integer), `sameOriginWrites` middleware, `nowIso(): string` in `server/http.ts`.
  - `createApp(): Hono<AppEnv>` and `app` in `server/app.ts`.
  - `startTestApi(options?: { env?: Partial<Env> }): Promise<TestApi>` with `TestApi { env; db; teacherId; request(method, path, body?, headers?): Promise<{ status; body }>; addTeacher(email, name): Promise<number>; dispose() }`, plus `splitSql(sql): string[]`, `applyMigrations(db)`, `TEACHER_EMAIL = 'profesor@example.com'` in `server/test/testApi.ts`. The seeded teacher is "Laura Miron" with `TEACHER_EMAIL`.

- [ ] **Step 1: Create `wrangler.toml`**

The all-zero `database_id` is for local development. Task 10 replaces it with the real id.

```toml
name = "quickeval"
pages_build_output_dir = "dist"
compatibility_date = "2026-10-01"

[[d1_databases]]
binding = "DB"
database_name = "quickeval"
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "migrations"
```

- [ ] **Step 2: Create `migrations/0001_people.sql`**

```sql
-- Teachers, classes, students, and which student is in which class.
-- Times are ISO 8601 UTC strings. One statement per ";" line end (the test
-- helper splits on that), and no ";" inside strings.

CREATE TABLE teachers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  name TEXT NOT NULL,
  school_year INTEGER NOT NULL,
  next_test_number INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (teacher_id, school_year, name)
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX students_by_teacher ON students (teacher_id);

CREATE TABLE enrollments (
  class_id INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (class_id, student_id)
);

CREATE INDEX enrollments_by_student ON enrollments (student_id);
```

- [ ] **Step 3: Create `server/env.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';

// Bindings and settings of the Pages project (wrangler.toml, Pages settings, .dev.vars).
export interface Env {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  // Local development only: honoured only for requests to localhost or 127.0.0.1.
  DEV_TEACHER_EMAIL?: string;
}

export interface AppEnv {
  Bindings: Env;
}
```

- [ ] **Step 4: Create `server/errors.ts`**

```ts
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// An error the API reports to the browser as { error, message } with this status.
// The message is Romanian text the teacher or student can read.
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(): ApiError {
  return new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
}

export function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String(err instanceof Error ? err.message : err));
}
```

- [ ] **Step 5: Create `server/http.ts`**

```ts
import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { ApiError, notFound } from './errors.ts';

// Reads a JSON body and checks it with a zod schema. The first problem becomes
// a 400 with the schema's Romanian message.
export async function readJson<Schema extends z.ZodType>(c: Context, schema: Schema): Promise<z.output<Schema>> {
  const type = c.req.header('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'bad_content_type', 'Cererea trebuie trimisă ca JSON.');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'bad_json', 'Cererea nu este JSON valid.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
  }
  return parsed.data;
}

// Route ids are positive integers. Anything else is a page that does not exist.
export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  return id;
}

// Writes must come from our own pages. A cross-site form or fetch carries
// Sec-Fetch-Site or an Origin from another site; both are refused.
export const sameOriginWrites: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const site = c.req.header('Sec-Fetch-Site');
    const origin = c.req.header('Origin');
    if ((site && site !== 'same-origin') || (origin && origin !== new URL(c.req.url).origin)) {
      throw new ApiError(403, 'cross_site', 'Cererea vine de pe alt site și a fost refuzată.');
    }
  }
  await next();
};

export function nowIso(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 6: Create `server/test/testApi.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { D1Database } from '@cloudflare/workers-types';
import { getPlatformProxy } from 'wrangler';
import { createApp } from '../app.ts';
import type { Env } from '../env.ts';

// API tests run the real Hono app in Node against the local D1 engine that
// `wrangler pages dev` also uses. getPlatformProxy reads the bindings from
// wrangler.toml. With persist: false, every startTestApi() call gets a new,
// empty, in-memory database; the migrations are applied to it here.

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
const WRANGLER_CONFIG = fileURLToPath(new URL('../../wrangler.toml', import.meta.url));

export const TEACHER_EMAIL = 'profesor@example.com';

export interface TestResponse {
  status: number;
  // The parsed JSON body. Tests read fields from it directly.
  body: any;
}

export interface TestApi {
  env: Env;
  db: D1Database;
  teacherId: number;
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse>;
  addTeacher(email: string, name: string): Promise<number>;
  dispose(): Promise<void>;
}

// Migration files hold one statement per ";" at a line end (see migrations/).
export function splitSql(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function applyMigrations(db: D1Database): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
    await db.batch(splitSql(sql).map((statement) => db.prepare(statement)));
  }
}

export async function startTestApi(options: { env?: Partial<Env> } = {}): Promise<TestApi> {
  const platform = await getPlatformProxy<Pick<Env, 'DB'>>({
    configPath: WRANGLER_CONFIG,
    persist: false,
    remoteBindings: false,
  });
  const db = platform.env.DB;
  await applyMigrations(db);

  const addTeacher = async (email: string, name: string) => {
    const row = await db
      .prepare('INSERT INTO teachers (email, name, created_at) VALUES (?, ?, ?) RETURNING id')
      .bind(email, name, '2026-10-06T08:00:00.000Z')
      .first<{ id: number }>();
    return row!.id;
  };
  const teacherId = await addTeacher(TEACHER_EMAIL, 'Laura Miron');

  const env: Env = { DB: db, DEV_TEACHER_EMAIL: TEACHER_EMAIL, ...options.env };
  const app = createApp();

  return {
    env,
    db,
    teacherId,
    addTeacher,
    async request(method, path, body, headers = {}) {
      const init: RequestInit = { method, headers: { ...headers } };
      if (body !== undefined) {
        init.headers = { 'Content-Type': 'application/json', ...headers };
        init.body = JSON.stringify(body);
      }
      const res = await app.request(`http://localhost${path}`, init, env);
      return { status: res.status, body: await res.json() };
    },
    dispose: () => platform.dispose(),
  };
}
```

- [ ] **Step 7: Create `server/app.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { splitSql, startTestApi, type TestApi } from './test/testApi.ts';

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.dispose();
});

describe('API app', () => {
  it('answers unknown paths with a JSON 404', async () => {
    const res = await api.request('GET', '/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: 'Nu am găsit ce cauți.' });
  });
});

describe('test database', () => {
  it('has the migrations applied and one teacher', async () => {
    const teacher = await api.db
      .prepare('SELECT email FROM teachers WHERE id = ?')
      .bind(api.teacherId)
      .first<{ email: string }>();
    expect(teacher?.email).toBe('profesor@example.com');
    const tables = await api.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all<{ name: string }>();
    expect(tables.results.map((table) => table.name)).toEqual(
      expect.arrayContaining(['teachers', 'classes', 'students', 'enrollments']),
    );
  });
});

describe('splitSql', () => {
  it('splits on semicolons at line ends and drops comment lines', () => {
    expect(splitSql('-- note\nCREATE TABLE a (x INTEGER);\n\nCREATE INDEX a_x ON a (x);\n')).toEqual([
      'CREATE TABLE a (x INTEGER)',
      'CREATE INDEX a_x ON a (x)',
    ]);
  });
});
```

- [ ] **Step 8: Run the test to see it fail**

Run: `npx vitest run --project node server`
Expected: FAIL with `Error: Cannot find module '../app.ts'` (imported by `server/test/testApi.ts`).

- [ ] **Step 9: Create `server/app.ts`**

```ts
import { Hono } from 'hono';
import type { AppEnv } from './env.ts';
import { ApiError } from './errors.ts';

// The whole API. functions/api/[[route]].ts serves it on Cloudflare Pages.
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');

  app.notFound((c) => c.json({ error: 'not_found', message: 'Nu am găsit ce cauți.' }, 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, message: err.message }, err.status);
    console.error('API error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'internal', message: 'A apărut o eroare. Încearcă din nou.' }, 500);
  });
  return app;
}

export const app = createApp();
```

- [ ] **Step 10: Create `functions/api/[[route]].ts`**

```ts
import { handle } from 'hono/cloudflare-pages';
import { app } from '../../server/app.ts';

// Cloudflare Pages sends every /api/* request here (see public/_routes.json).
export const onRequest = handle(app);
```

- [ ] **Step 11: Run the tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  4 passed (4)`, `Tests  17 passed (17)`. Wrangler may print a line about using `.dev.vars` or local bindings; that is fine.

- [ ] **Step 12: Run the typecheck**

Run: `npm run typecheck`
Expected: exit code 0.

- [ ] **Step 13: Commit**

```bash
git add wrangler.toml migrations server functions
git commit -m "Add the API skeleton, the people tables and the API test helper"
```

---

### Task 3: Teacher login (Cloudflare Access) and `/api/admin/me`

The API knows who the teacher is. Production checks the Cloudflare Access token again; local development uses `DEV_TEACHER_EMAIL`, only on localhost. Writes from other sites are refused.

**Files:**
- Create: `shared/api.ts` (the `Teacher` shape; Task 4 replaces the file)
- Replace: `server/env.ts`, `server/app.ts`
- Create: `server/auth/access.ts`, `server/db/teachers.ts`, `server/auth/teacherAuth.ts`, `server/routes/admin.ts`
- Test: `server/auth/access.test.ts`, `server/routes/admin.test.ts`

**Interfaces:**
- Consumes: `ApiError`, `sameOriginWrites`, `createApp`, `startTestApi` (Task 2).
- Produces:
  - `interface Teacher { id: number; email: string; name: string }` in `shared/api.ts`.
  - `AppEnv` gains `Variables: { teacher: Teacher }`; route handlers read `c.var.teacher`.
  - `verifyAccessJwt(token: string | undefined, config: { teamDomain: string; aud: string }, fetchImpl?: FetchLike): Promise<{ ok: true; email: string } | { ok: false; message: string }>`, `clearCertCache()`, `type FetchLike` in `server/auth/access.ts`.
  - `findTeacherByEmail(db, email): Promise<Teacher | null>` in `server/db/teachers.ts`.
  - `teacherAuth(): MiddlewareHandler<AppEnv>` in `server/auth/teacherAuth.ts`.
  - `adminRoutes(): Hono<AppEnv>` serving `GET /api/admin/me` → `{ teacher }` in `server/routes/admin.ts`.

- [ ] **Step 1: Create `server/auth/access.test.ts`**

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearCertCache, verifyAccessJwt, type FetchLike } from './access.ts';

const TEAM = 'school.cloudflareaccess.com';
const AUD = 'aud-123';
const config = { teamDomain: TEAM, aud: AUD };

let privateKey: CryptoKey;
let publicJwk: JsonWebKey & { kid: string };

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const encodeJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

async function sign(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'key-1' }) {
  const input = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(input));
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const goodPayload = () => ({ email: 'Profesor@Example.com', aud: [AUD], iss: `https://${TEAM}`, exp: nowSec() + 600 });
const certsFetch: FetchLike = async () => Response.json({ keys: [publicJwk] });

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = pair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'key-1' };
});

beforeEach(() => clearCertCache());

describe('verifyAccessJwt', () => {
  it('accepts a good token and returns the email in lowercase', async () => {
    expect(await verifyAccessJwt(await sign(goodPayload()), config, certsFetch)).toEqual({
      ok: true,
      email: 'profesor@example.com',
    });
  });

  it('refuses a missing token', async () => {
    expect((await verifyAccessJwt(undefined, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token that is not RS256', async () => {
    const token = await sign(goodPayload(), { alg: 'HS256', kid: 'key-1' });
    expect((await verifyAccessJwt(token, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token signed with an unknown key id', async () => {
    const token = await sign(goodPayload(), { alg: 'RS256', kid: 'other' });
    expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({
      ok: false,
      message: 'Cheie de autentificare necunoscută.',
    });
  });

  it('refuses a changed payload', async () => {
    const [head, , sig] = (await sign(goodPayload())).split('.');
    const forged = `${head}.${encodeJson({ ...goodPayload(), email: 'intruder@example.com' })}.${sig}`;
    expect((await verifyAccessJwt(forged, config, certsFetch)).ok).toBe(false);
  });

  it('refuses an expired token', async () => {
    const token = await sign({ ...goodPayload(), exp: nowSec() - 1 });
    expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({ ok: false, message: 'Autentificarea a expirat.' });
  });

  it('refuses a token for another audience or issuer', async () => {
    const otherAudience = await sign({ ...goodPayload(), aud: ['other'] });
    const otherIssuer = await sign({ ...goodPayload(), iss: 'https://evil.example' });
    expect((await verifyAccessJwt(otherAudience, config, certsFetch)).ok).toBe(false);
    expect((await verifyAccessJwt(otherIssuer, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token without an email', async () => {
    const { email: _ignored, ...payload } = goodPayload();
    expect((await verifyAccessJwt(await sign(payload), config, certsFetch)).ok).toBe(false);
  });

  it('downloads the keys again once when it meets an unknown key id', async () => {
    let calls = 0;
    const rotatingFetch: FetchLike = async () => {
      calls += 1;
      return Response.json({ keys: calls === 1 ? [] : [publicJwk] });
    };
    expect((await verifyAccessJwt(await sign(goodPayload()), config, rotatingFetch)).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('reports a failed key download without throwing', async () => {
    const failingFetch: FetchLike = async () => new Response('down', { status: 503 });
    expect(await verifyAccessJwt(await sign(goodPayload()), config, failingFetch)).toEqual({
      ok: false,
      message: 'Nu pot verifica autentificarea acum.',
    });
  });
});
```

- [ ] **Step 2: Create `server/routes/admin.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi | undefined;

afterEach(async () => {
  await api?.dispose();
  api = undefined;
});

describe('GET /api/admin/me', () => {
  it('returns the teacher of the local development login', async () => {
    api = await startTestApi();
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ teacher: { id: api.teacherId, email: 'profesor@example.com', name: 'Laura Miron' } });
  });

  it('refuses a login email that is not a teacher', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: 'stranger@example.com' } });
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('unknown_teacher');
  });

  it('ignores the development login on a real host and asks for Access', async () => {
    api = await startTestApi({ env: { ACCESS_TEAM_DOMAIN: 'school.cloudflareaccess.com', ACCESS_AUD: 'aud' } });
    const res = await createApp().request('https://quickeval.pages.dev/api/admin/me', {}, api.env);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'access_denied', message: 'Lipsește autentificarea.' });
  });

  it('names the missing Access settings when nothing is configured', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('access_not_configured');
  });
});

describe('admin API protections', () => {
  it('refuses a write that comes from another site', async () => {
    api = await startTestApi();
    const res = await api.request('POST', '/api/admin/me', {}, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_site');
  });

  it('refuses a write marked cross-site by the browser', async () => {
    api = await startTestApi();
    const res = await api.request('POST', '/api/admin/me', {}, { 'Sec-Fetch-Site': 'cross-site' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_site');
  });

  it('answers unknown admin paths with a JSON 404', async () => {
    api = await startTestApi();
    const res = await api.request('GET', '/api/admin/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run --project node server/auth server/routes`
Expected: FAIL. `access.test.ts`: `Cannot find module './access.ts'`. `admin.test.ts`: 6 of its 7 tests fail with messages like `expected 404 to be 200`, because no admin routes exist yet (the JSON 404 test already passes).

- [ ] **Step 4: Create `server/auth/access.ts`**

```ts
// Checks the Cloudflare Access login token (Cf-Access-Jwt-Assertion header):
// RS256 signature against the team's published keys, issuer, audience, expiry
// and not-before. Ported from the Website's functions/tm25mlg/api/_middleware.js.

export interface AccessConfig {
  teamDomain: string;
  aud: string;
}

export type AccessResult = { ok: true; email: string } | { ok: false; message: string };

export type FetchLike = (url: string) => Promise<Response>;

interface Jwk extends JsonWebKey {
  kid?: string;
}

interface ParsedJwt {
  header: { alg?: string; kid?: string };
  payload: { email?: unknown; aud?: unknown; iss?: unknown; exp?: unknown; nbf?: unknown };
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
}

const CACHE_FOR_MS = 5 * 60 * 1000;
// At most one forced download per this time, so tokens with made-up key ids
// cannot turn into a stream of downloads.
const REFETCH_EVERY_MS = 30 * 1000;

let certCache: { at: number; forcedAt: number; keys: Jwk[] | null } = { at: 0, forcedAt: 0, keys: null };

// Test hook: forget the cached signing keys.
export function clearCertCache(): void {
  certCache = { at: 0, forcedAt: 0, keys: null };
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseJwt(token: string): ParsedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];
  try {
    const decode = (part: string) => JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
    return { header: decode(head), payload: decode(body), signingInput: `${head}.${body}`, signature: base64UrlToBytes(sig) };
  } catch {
    return null;
  }
}

// fresh: skip the cache once, because Access rotates its signing keys.
async function accessKeys(teamDomain: string, fetchImpl: FetchLike, fresh: boolean): Promise<Jwk[]> {
  const now = Date.now();
  if (certCache.keys) {
    if (!fresh && now - certCache.at < CACHE_FOR_MS) return certCache.keys;
    if (fresh && now - certCache.forcedAt < REFETCH_EVERY_MS) return certCache.keys;
  }
  if (fresh) certCache.forcedAt = now;
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs HTTP ${res.status}`);
  const json = (await res.json()) as { keys?: Jwk[] };
  certCache.keys = json.keys ?? [];
  certCache.at = now;
  return certCache.keys;
}

export async function verifyAccessJwt(
  token: string | undefined,
  config: AccessConfig,
  fetchImpl: FetchLike = (url) => fetch(url),
): Promise<AccessResult> {
  if (!token) return { ok: false, message: 'Lipsește autentificarea.' };
  const jwt = parseJwt(token);
  if (!jwt || jwt.header.alg !== 'RS256') return { ok: false, message: 'Token de autentificare greșit.' };

  const findKey = async (fresh: boolean) =>
    (await accessKeys(config.teamDomain, fetchImpl, fresh)).find((key) => key.kid === jwt.header.kid) ?? null;
  let jwk: Jwk | null;
  try {
    jwk = (await findKey(false)) ?? (await findKey(true));
  } catch {
    return { ok: false, message: 'Nu pot verifica autentificarea acum.' };
  }
  if (!jwk) return { ok: false, message: 'Cheie de autentificare necunoscută.' };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    return { ok: false, message: 'Cheie de autentificare greșită.' };
  }
  const valid = await crypto.subtle
    .verify('RSASSA-PKCS1-v1_5', key, jwt.signature, new TextEncoder().encode(jwt.signingInput))
    .catch(() => false);
  if (!valid) return { ok: false, message: 'Semnătura autentificării nu este validă.' };

  const { email, aud, iss, exp, nbf } = jwt.payload;
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof exp !== 'number' || exp <= nowSec) return { ok: false, message: 'Autentificarea a expirat.' };
  // One minute of leeway for clock drift between Access and this Function.
  if (typeof nbf === 'number' && nbf > nowSec + 60) return { ok: false, message: 'Autentificarea nu este încă validă.' };
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(config.aud)) return { ok: false, message: 'Autentificare pentru altă aplicație.' };
  if (String(iss ?? '').replace(/\/+$/, '') !== `https://${config.teamDomain}`) {
    return { ok: false, message: 'Autentificare de la alt emitent.' };
  }
  if (typeof email !== 'string' || email === '') return { ok: false, message: 'Autentificarea nu are email.' };
  return { ok: true, email: email.toLowerCase() };
}
```

- [ ] **Step 5: Create `shared/api.ts`**

```ts
// Shapes of the teacher API. The server and the browser both import them.

export interface Teacher {
  id: number;
  email: string;
  name: string;
}
```

- [ ] **Step 6: Replace `server/env.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { Teacher } from '../shared/api.ts';

// Bindings and settings of the Pages project (wrangler.toml, Pages settings, .dev.vars).
export interface Env {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  // Local development only: honoured only for requests to localhost or 127.0.0.1.
  DEV_TEACHER_EMAIL?: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { teacher: Teacher };
}
```

- [ ] **Step 7: Create `server/db/teachers.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { Teacher } from '../../shared/api.ts';

export async function findTeacherByEmail(db: D1Database, email: string): Promise<Teacher | null> {
  return db.prepare('SELECT id, email, name FROM teachers WHERE email = ?').bind(email.toLowerCase()).first<Teacher>();
}
```

- [ ] **Step 8: Create `server/auth/teacherAuth.ts`**

```ts
import type { Context, MiddlewareHandler } from 'hono';
import { findTeacherByEmail } from '../db/teachers.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { verifyAccessJwt } from './access.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// The email of the person who made the request. Production: the Cloudflare
// Access token, checked again here because Access runs before this code.
// Local development: DEV_TEACHER_EMAIL from .dev.vars, but only for requests
// to localhost, so the setting can never open the live site.
async function loginEmail(c: Context<AppEnv>): Promise<string> {
  const devEmail = c.env.DEV_TEACHER_EMAIL?.trim().toLowerCase();
  if (devEmail && LOCAL_HOSTS.has(new URL(c.req.url).hostname)) return devEmail;

  const teamDomain = (c.env.ACCESS_TEAM_DOMAIN ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const aud = (c.env.ACCESS_AUD ?? '').trim();
  if (!teamDomain || !aud) {
    throw new ApiError(500, 'access_not_configured', 'Autentificarea nu este configurată: lipsesc ACCESS_TEAM_DOMAIN sau ACCESS_AUD.');
  }
  const result = await verifyAccessJwt(c.req.header('Cf-Access-Jwt-Assertion'), { teamDomain, aud });
  if (!result.ok) throw new ApiError(403, 'access_denied', result.message);
  return result.email;
}

// Puts the logged-in teacher in c.var.teacher, or refuses the request.
export function teacherAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const email = await loginEmail(c);
    const teacher = await findTeacherByEmail(c.env.DB, email);
    if (!teacher) throw new ApiError(403, 'unknown_teacher', 'Contul tău nu are acces la QuickEval.');
    c.set('teacher', teacher);
    await next();
  };
}
```

- [ ] **Step 9: Create `server/routes/admin.ts`**

```ts
import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv } from '../env.ts';
import { sameOriginWrites } from '../http.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login.
export function adminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth());
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher }));
  return routes;
}
```

- [ ] **Step 10: Replace `server/app.ts`**

```ts
import { Hono } from 'hono';
import type { AppEnv } from './env.ts';
import { ApiError } from './errors.ts';
import { adminRoutes } from './routes/admin.ts';

// The whole API. functions/api/[[route]].ts serves it on Cloudflare Pages.
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');
  app.route('/admin', adminRoutes());

  app.notFound((c) => c.json({ error: 'not_found', message: 'Nu am găsit ce cauți.' }, 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, message: err.message }, err.status);
    console.error('API error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'internal', message: 'A apărut o eroare. Încearcă din nou.' }, 500);
  });
  return app;
}

export const app = createApp();
```

- [ ] **Step 11: Run the tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  6 passed (6)`, `Tests  34 passed (34)`. The test "names the missing Access settings" makes the API log nothing; an `API error:` line in the output would mean an unexpected 500.

- [ ] **Step 12: Run the typecheck**

Run: `npm run typecheck`
Expected: exit code 0.

- [ ] **Step 13: Commit**

```bash
git add shared/api.ts server
git commit -m "Check the Cloudflare Access login and add /api/admin/me"
```

---

### Task 4: Classes API

The teacher lists, creates, renames, and archives classes per school year. Class names are normalized ("6e2" → "6E2") and unique per teacher and school year.

**Files:**
- Replace: `shared/api.ts` (all request schemas and response types for classes and students)
- Create: `server/db/classes.ts`, `server/routes/classes.ts`
- Replace: `server/routes/admin.ts`
- Test: `shared/api.test.ts`, `server/routes/classes.test.ts`

**Interfaces:**
- Consumes: `Teacher`, `ApiError`, `notFound`, `isUniqueViolation`, `readJson`, `parseId`, `nowIso`, `startTestApi`, shared rules from Task 1.
- Produces:
  - zod schemas in `shared/api.ts`: `schoolYearSchema`, `classNameSchema`, `studentNameSchema`, `createClassBody`, `updateClassBody`, `addStudentsBody`, `setEnrollmentBody`, `renameStudentBody`; types `CreateClassInput`, `UpdateClassInput`; interfaces `Teacher`, `ClassSummary { id; name; schoolYear; archived; studentCount }`, `StudentRow { id; fullName; active }`, `ClassDetail { class: ClassSummary; students: StudentRow[] }`.
  - `listClasses(db, teacherId, schoolYear)`, `getClass(db, teacherId, classId)`, `createClass(db, teacherId, name, schoolYear, now)`, `updateClass(db, teacherId, classId, changes)`, `listClassStudents(db, classId)` in `server/db/classes.ts`.
  - HTTP: `GET /api/admin/classes?year=` → `{ classes }`, `POST /api/admin/classes` `{ name, schoolYear }` → 201 `{ class }`, `GET /api/admin/classes/:id` → `{ class, students }`, `PATCH /api/admin/classes/:id` `{ name?, archived? }` → `{ class }`.

- [ ] **Step 1: Create `shared/api.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { addStudentsBody, createClassBody, renameStudentBody, updateClassBody } from './api.ts';

describe('createClassBody', () => {
  it('normalizes the class name', () => {
    expect(createClassBody.parse({ name: ' 6e2', schoolYear: 2026 })).toEqual({ name: '6E2', schoolYear: 2026 });
  });

  it('explains a bad class name in Romanian', () => {
    const result = createClassBody.safeParse({ name: '6-E2', schoolYear: 2026 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
  });

  it('refuses a school year outside 2020-2100', () => {
    expect(createClassBody.safeParse({ name: '6E2', schoolYear: 1999 }).success).toBe(false);
  });
});

describe('updateClassBody', () => {
  it('needs at least one field', () => {
    expect(updateClassBody.safeParse({}).success).toBe(false);
    expect(updateClassBody.parse({ archived: true })).toEqual({ archived: true });
  });
});

describe('addStudentsBody', () => {
  it('cleans every name', () => {
    expect(addStudentsBody.parse({ names: ['1. Pop  Ana'] })).toEqual({ names: ['Pop Ana'] });
  });

  it('refuses an empty list, an empty name, and more than 60 names', () => {
    expect(addStudentsBody.safeParse({ names: [] }).success).toBe(false);
    expect(addStudentsBody.safeParse({ names: ['  '] }).success).toBe(false);
    expect(addStudentsBody.safeParse({ names: Array.from({ length: 61 }, (_, i) => `Elev ${i}`) }).success).toBe(false);
  });
});

describe('renameStudentBody', () => {
  it('refuses a name longer than 80 characters', () => {
    expect(renameStudentBody.safeParse({ fullName: 'a'.repeat(81) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Create `server/routes/classes.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.dispose();
});

async function createClass(name: string, schoolYear = 2026) {
  const res = await api.request('POST', '/api/admin/classes', { name, schoolYear });
  expect(res.status).toBe(201);
  return res.body.class as { id: number; name: string };
}

describe('classes', () => {
  it('creates a class with a normalized name', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6e2', schoolYear: 2026 });
    expect(res.status).toBe(201);
    expect(res.body.class).toMatchObject({ name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 });
  });

  it('refuses the same class name twice in one school year', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2026 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Clasa 6E2 există deja în anul școlar 2026-2027.');
  });

  it('allows the same class name in another school year', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2027 });
    expect(res.status).toBe(201);
  });

  it('refuses a bad class name with a Romanian message', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6-E2', schoolYear: 2026 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
  });

  it('lists the classes of one school year, active first, in number order', async () => {
    await createClass('11R1');
    const archived = await createClass('9R2');
    await api.request('PATCH', `/api/admin/classes/${archived.id}`, { archived: true });
    const res = await api.request('GET', '/api/admin/classes?year=2026');
    expect(res.status).toBe(200);
    expect(res.body.classes.map((c: { name: string }) => c.name)).toEqual(['6E2', '11R1', '9R2']);
  });

  it('refuses a body that is not JSON', async () => {
    const res = await api.request('POST', '/api/admin/classes', undefined, { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
    expect(res.body.error).toBe('bad_content_type');
  });

  it('refuses a bad year in the list', async () => {
    const res = await api.request('GET', '/api/admin/classes?year=abc');
    expect(res.status).toBe(400);
  });

  it('renames a class', async () => {
    const created = await createClass('7E2');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}`, { name: '7e3' });
    expect(res.status).toBe(200);
    expect(res.body.class.name).toBe('7E3');
  });

  it('refuses a rename to a name that already exists', async () => {
    const created = await createClass('8E2');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}`, { name: '6E2' });
    expect(res.status).toBe(409);
  });

  it('hides the classes of other teachers', async () => {
    const otherId = await api.addTeacher('other@example.com', 'Alt Profesor');
    const row = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '5A', 2026, '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    expect((await api.request('GET', `/api/admin/classes/${row!.id}`)).status).toBe(404);
    expect((await api.request('PATCH', `/api/admin/classes/${row!.id}`, { archived: true })).status).toBe(404);
    const list = await api.request('GET', '/api/admin/classes?year=2026');
    expect(list.body.classes.map((c: { name: string }) => c.name)).not.toContain('5A');
  });

  it('answers 404 for an id that is not a number', async () => {
    expect((await api.request('GET', '/api/admin/classes/abc')).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run --project node shared/api.test.ts server/routes/classes.test.ts`
Expected: FAIL, 17 tests. The schema tests fail with `TypeError: Cannot read properties of undefined (reading 'parse')` (the schemas are not exported yet). The class tests fail with messages like `expected 404 to be 201` (no classes route yet).

- [ ] **Step 4: Replace `shared/api.ts`**

```ts
import { z } from 'zod';
import { normalizeClassName } from './classes.ts';
import { isValidSchoolYear } from './schoolYear.ts';
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';

// Request bodies of the teacher API. The server parses every body with these
// schemas; the browser uses the inferred types.

export const schoolYearSchema = z
  .number()
  .refine(isValidSchoolYear, { message: 'Anul școlar nu este valid.' });

export const classNameSchema = z.string().transform((raw, ctx) => {
  const name = normalizeClassName(raw);
  if (name === null) {
    ctx.addIssue({ code: 'custom', message: 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.' });
    return z.NEVER;
  }
  return name;
});

export const studentNameSchema = z
  .string()
  .transform(cleanStudentName)
  .pipe(
    z
      .string()
      .min(1, { message: 'Numele elevului lipsește.' })
      .max(MAX_NAME_LENGTH, { message: `Numele unui elev are cel mult ${MAX_NAME_LENGTH} de caractere.` }),
  );

export const createClassBody = z.object({
  name: classNameSchema,
  schoolYear: schoolYearSchema,
});

export const updateClassBody = z
  .object({
    name: classNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.name !== undefined || body.archived !== undefined, {
    message: 'Nu ai schimbat nimic.',
  });

export const addStudentsBody = z.object({
  names: z
    .array(studentNameSchema)
    .min(1, { message: 'Scrie cel puțin un nume.' })
    .max(MAX_NAMES_PER_REQUEST, { message: `Adaugă cel mult ${MAX_NAMES_PER_REQUEST} de nume odată.` }),
});

export const setEnrollmentBody = z.object({ active: z.boolean() });

export const renameStudentBody = z.object({ fullName: studentNameSchema });

export type CreateClassInput = z.input<typeof createClassBody>;
export type UpdateClassInput = z.input<typeof updateClassBody>;

// Response shapes of the teacher API.

export interface Teacher {
  id: number;
  email: string;
  name: string;
}

export interface ClassSummary {
  id: number;
  name: string;
  schoolYear: number;
  archived: boolean;
  studentCount: number;
}

export interface StudentRow {
  id: number;
  fullName: string;
  active: boolean;
}

export interface ClassDetail {
  class: ClassSummary;
  students: StudentRow[];
}
```

- [ ] **Step 5: Create `server/db/classes.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ClassSummary, StudentRow } from '../../shared/api.ts';
import { compareClassNames, displayClassName } from '../../shared/classes.ts';
import { formatSchoolYear } from '../../shared/schoolYear.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';

interface ClassRow {
  id: number;
  name: string;
  school_year: number;
  archived: number;
  student_count: number;
}

const SELECT_CLASS = `
  SELECT c.id, c.name, c.school_year, c.archived,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.active = 1) AS student_count
  FROM classes c`;

function toSummary(row: ClassRow): ClassSummary {
  return {
    id: row.id,
    name: row.name,
    schoolYear: row.school_year,
    archived: row.archived === 1,
    studentCount: row.student_count,
  };
}

function duplicateClass(name: string, schoolYear: number): ApiError {
  return new ApiError(409, 'class_exists', `${displayClassName(name)} există deja în anul școlar ${formatSchoolYear(schoolYear)}.`);
}

// Active classes first, then archived ones; "6E2" before "11R1".
export async function listClasses(db: D1Database, teacherId: number, schoolYear: number): Promise<ClassSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_CLASS} WHERE c.teacher_id = ? AND c.school_year = ?`)
    .bind(teacherId, schoolYear)
    .all<ClassRow>();
  return results
    .map(toSummary)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || compareClassNames(a.name, b.name));
}

export async function getClass(db: D1Database, teacherId: number, classId: number): Promise<ClassSummary | null> {
  const row = await db
    .prepare(`${SELECT_CLASS} WHERE c.teacher_id = ? AND c.id = ?`)
    .bind(teacherId, classId)
    .first<ClassRow>();
  return row ? toSummary(row) : null;
}

export async function createClass(
  db: D1Database,
  teacherId: number,
  name: string,
  schoolYear: number,
  now: string,
): Promise<ClassSummary> {
  try {
    const row = await db
      .prepare('INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(teacherId, name, schoolYear, now)
      .first<{ id: number }>();
    return { id: row!.id, name, schoolYear, archived: false, studentCount: 0 };
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateClass(name, schoolYear);
    throw err;
  }
}

export async function updateClass(
  db: D1Database,
  teacherId: number,
  classId: number,
  changes: { name?: string | undefined; archived?: boolean | undefined },
): Promise<ClassSummary> {
  const current = await getClass(db, teacherId, classId);
  if (!current) throw notFound();
  const name = changes.name ?? current.name;
  const archived = changes.archived ?? current.archived;
  try {
    await db
      .prepare('UPDATE classes SET name = ?, archived = ? WHERE id = ? AND teacher_id = ?')
      .bind(name, archived ? 1 : 0, classId, teacherId)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateClass(name, current.schoolYear);
    throw err;
  }
  return { ...current, name, archived };
}

// All students ever enrolled in the class; students who left have active = false.
export async function listClassStudents(db: D1Database, classId: number): Promise<StudentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.full_name, e.active
       FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.class_id = ?`,
    )
    .bind(classId)
    .all<{ id: number; full_name: string; active: number }>();
  return results
    .map((row) => ({ id: row.id, fullName: row.full_name, active: row.active === 1 }))
    .sort((a, b) => compareStudentNames(a.fullName, b.fullName));
}
```

- [ ] **Step 6: Create `server/routes/classes.ts`**

```ts
import { Hono } from 'hono';
import { createClassBody, updateClassBody } from '../../shared/api.ts';
import { isValidSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { createClass, getClass, listClasses, listClassStudents, updateClass } from '../db/classes.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';

// /api/admin/classes
export function classRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const raw = c.req.query('year');
    const year = raw === undefined ? schoolYearOf(new Date()) : Number(raw);
    if (!isValidSchoolYear(year)) throw new ApiError(400, 'invalid', 'Anul școlar nu este valid.');
    return c.json({ classes: await listClasses(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createClassBody);
    const created = await createClass(c.env.DB, c.var.teacher.id, body.name, body.schoolYear, nowIso());
    return c.json({ class: created }, 201);
  });

  routes.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const found = await getClass(c.env.DB, c.var.teacher.id, id);
    if (!found) throw notFound();
    return c.json({ class: found, students: await listClassStudents(c.env.DB, id) });
  });

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, updateClassBody);
    return c.json({ class: await updateClass(c.env.DB, c.var.teacher.id, id, body) });
  });

  return routes;
}
```

- [ ] **Step 7: Replace `server/routes/admin.ts`**

```ts
import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv } from '../env.ts';
import { sameOriginWrites } from '../http.ts';
import { classRoutes } from './classes.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login.
export function adminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth());
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher }));
  routes.route('/classes', classRoutes());
  return routes;
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  8 passed (8)`, `Tests  52 passed (52)`.

- [ ] **Step 9: Run the typecheck**

Run: `npm run typecheck`
Expected: exit code 0.

- [ ] **Step 10: Commit**

```bash
git add shared/api.ts shared/api.test.ts server
git commit -m "Add the classes API"
```

---

### Task 5: Students API

The teacher adds students to a class (one name or a pasted list of up to 60), renames a student, and marks a student as left or back. Adding students always takes the same small number of D1 queries, and either all names are saved or none.

**Files:**
- Create: `server/db/students.ts`, `server/routes/students.ts`
- Replace: `server/routes/classes.ts`, `server/routes/admin.ts`
- Append to: `server/routes/classes.test.ts`
- Test: `server/db/students.test.ts`, `server/routes/students.test.ts`

**Interfaces:**
- Consumes: everything from Task 4.
- Produces:
  - `addStudentsToClass(db, teacherId, classId, names, now): Promise<StudentRow[]>` (409 `busy` when another request took the same ids), `setEnrollmentActive(db, teacherId, classId, studentId, active): Promise<StudentRow | null>`, `renameStudent(db, teacherId, studentId, fullName): Promise<{ id; fullName } | null>` in `server/db/students.ts`.
  - HTTP: `POST /api/admin/classes/:id/students` `{ names }` → 201 `{ students }`, `PATCH /api/admin/classes/:id/students/:studentId` `{ active }` → `{ student }`, `PATCH /api/admin/students/:id` `{ fullName }` → `{ student: { id, fullName } }`.

- [ ] **Step 1: Create `server/db/students.test.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { addStudentsToClass } from './students.ts';

let api: TestApi;
let classId: number;

beforeAll(async () => {
  api = await startTestApi();
  const row = await api.db
    .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '6E2', 2026, '2026-10-06') RETURNING id")
    .bind(api.teacherId)
    .first<{ id: number }>();
  classId = row!.id;
});

afterAll(async () => {
  await api.dispose();
});

const count = async (sql: string) => (await api.db.prepare(sql).first<{ n: number }>())!.n;

describe('addStudentsToClass', () => {
  it('adds the students and enrolls them, with ids in name order', async () => {
    const added = await addStudentsToClass(api.db, api.teacherId, classId, ['Pop Ion', 'Ionescu Ana'], '2026-10-06T08:00:00.000Z');
    expect(added.map((s) => s.fullName)).toEqual(['Pop Ion', 'Ionescu Ana']);
    expect(added[1]!.id).toBe(added[0]!.id + 1);
    expect(await count(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ${classId}`)).toBe(2);
  });

  it('adds nothing when another request took the same ids', async () => {
    const studentsBefore = await count('SELECT COUNT(*) AS n FROM students');
    // A database whose "highest id" answer is stale, as if another request
    // inserted students between the read and the batch.
    const stale = {
      prepare: (sql: string) => api.db.prepare(sql.startsWith('SELECT COALESCE(MAX(id)') ? 'SELECT 0 AS max' : sql),
      batch: api.db.batch.bind(api.db),
    } as unknown as D1Database;
    await expect(addStudentsToClass(stale, api.teacherId, classId, ['Nou Elev'], '2026-10-06T08:00:00.000Z')).rejects.toMatchObject({
      status: 409,
      code: 'busy',
    });
    expect(await count('SELECT COUNT(*) AS n FROM students')).toBe(studentsBefore);
    expect(await count(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ${classId}`)).toBe(2);
  });
});
```

- [ ] **Step 2: Append to `server/routes/classes.test.ts`**

Add this block at the end of the file. It uses the `api` variable and the `createClass` helper that are already at the top of the file.

```ts

describe('students in a class', () => {
  it('adds pasted names, cleaned, and lists them in Romanian order', async () => {
    const created = await createClass('10A');
    const add = await api.request('POST', `/api/admin/classes/${created.id}/students`, {
      names: ['2. Ștefan Ana', 'Sandu  Ion', 'Tudor Ema'],
    });
    expect(add.status).toBe(201);
    expect(add.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ștefan Ana', 'Sandu Ion', 'Tudor Ema']);

    const detail = await api.request('GET', `/api/admin/classes/${created.id}`);
    expect(detail.body.class.studentCount).toBe(3);
    expect(detail.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Sandu Ion', 'Ștefan Ana', 'Tudor Ema']);
  });

  it('adds 60 names in one request', async () => {
    const created = await createClass('10B');
    const names = Array.from({ length: 60 }, (_, i) => `Elev ${i + 1}`);
    const res = await api.request('POST', `/api/admin/classes/${created.id}/students`, { names });
    expect(res.status).toBe(201);
    expect(new Set(res.body.students.map((s: { id: number }) => s.id)).size).toBe(60);
  });

  it('marks a student as left and back, keeping the student in the list', async () => {
    const created = await createClass('10C');
    const add = await api.request('POST', `/api/admin/classes/${created.id}/students`, { names: ['Pop Ion'] });
    const studentId = add.body.students[0].id;

    const left = await api.request('PATCH', `/api/admin/classes/${created.id}/students/${studentId}`, { active: false });
    expect(left.status).toBe(200);
    expect(left.body.student).toEqual({ id: studentId, fullName: 'Pop Ion', active: false });

    const detail = await api.request('GET', `/api/admin/classes/${created.id}`);
    expect(detail.body.class.studentCount).toBe(0);
    expect(detail.body.students).toEqual([{ id: studentId, fullName: 'Pop Ion', active: false }]);

    const back = await api.request('PATCH', `/api/admin/classes/${created.id}/students/${studentId}`, { active: true });
    expect(back.body.student.active).toBe(true);
  });

  it('refuses to add students to a class that does not exist', async () => {
    const res = await api.request('POST', '/api/admin/classes/99999/students', { names: ['Pop Ion'] });
    expect(res.status).toBe(404);
  });

  it('answers 404 when the student is not in that class', async () => {
    const created = await createClass('10D');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}/students/99999`, { active: false });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Create `server/routes/students.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let studentId: number;

beforeAll(async () => {
  api = await startTestApi();
  const created = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2026 });
  const added = await api.request('POST', `/api/admin/classes/${created.body.class.id}/students`, { names: ['Pop Ion'] });
  studentId = added.body.students[0].id;
});

afterAll(async () => {
  await api.dispose();
});

describe('PATCH /api/admin/students/:id', () => {
  it('renames a student with a cleaned name', async () => {
    const res = await api.request('PATCH', `/api/admin/students/${studentId}`, { fullName: '  Pop   Ioan ' });
    expect(res.status).toBe(200);
    expect(res.body.student).toEqual({ id: studentId, fullName: 'Pop Ioan' });
  });

  it('refuses an empty name', async () => {
    const res = await api.request('PATCH', `/api/admin/students/${studentId}`, { fullName: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Numele elevului lipsește.');
  });

  it('answers 404 for a student of another teacher', async () => {
    const otherId = await api.addTeacher('other@example.com', 'Alt Profesor');
    const row = await api.db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Alt Elev', '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    const res = await api.request('PATCH', `/api/admin/students/${row!.id}`, { fullName: 'Nume Nou' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run --project node server`
Expected: FAIL. `server/db/students.test.ts`: `Cannot find module './students.ts'`. In `classes.test.ts`, 3 of the new tests fail (the 2 tests that expect a 404 already pass). `routes/students.test.ts` stops in `beforeAll`, so its 3 tests are skipped. Summary: `Tests  3 failed | 33 passed | 3 skipped (39)`.

- [ ] **Step 5: Create `server/db/students.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { StudentRow } from '../../shared/api.ts';
import { ApiError, isUniqueViolation } from '../errors.ts';

// Adds new students and enrolls them in the class with a fixed number of
// queries, whatever the number of names: the free plan limits the queries per
// request. The ids are chosen here (one above the current maximum) so the
// enrollment insert can name them. Both inserts run in one batch, which D1 runs
// as one transaction: either every name is added or none is. If another request
// took one of these ids in the meantime, the batch fails on the primary key and
// the teacher is asked to try again.
export async function addStudentsToClass(
  db: D1Database,
  teacherId: number,
  classId: number,
  names: string[],
  now: string,
): Promise<StudentRow[]> {
  const top = await db.prepare('SELECT COALESCE(MAX(id), 0) AS max FROM students').first<{ max: number }>();
  const rows = names.map((fullName, index) => ({ id: (top?.max ?? 0) + index + 1, fullName }));
  const json = JSON.stringify(rows);
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO students (id, teacher_id, full_name, created_at)
           SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.fullName'), ? FROM json_each(?)`,
        )
        .bind(teacherId, now, json),
      db
        .prepare('INSERT INTO enrollments (class_id, student_id) SELECT ?, json_extract(value, \'$.id\') FROM json_each(?)')
        .bind(classId, json),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'busy', 'Altcineva a adăugat elevi în același timp. Încearcă din nou.');
    }
    throw err;
  }
  return rows.map((row) => ({ id: row.id, fullName: row.fullName, active: true }));
}

// Marks a student as left (active = false) or back in the class. The class must
// belong to the teacher. Returns null when the student is not in that class.
export async function setEnrollmentActive(
  db: D1Database,
  teacherId: number,
  classId: number,
  studentId: number,
  active: boolean,
): Promise<StudentRow | null> {
  const row = await db
    .prepare(
      `UPDATE enrollments SET active = ?
       WHERE class_id = ? AND student_id = ?
         AND class_id IN (SELECT id FROM classes WHERE teacher_id = ?)
       RETURNING student_id`,
    )
    .bind(active ? 1 : 0, classId, studentId, teacherId)
    .first<{ student_id: number }>();
  if (!row) return null;
  const student = await db
    .prepare('SELECT full_name FROM students WHERE id = ?')
    .bind(studentId)
    .first<{ full_name: string }>();
  return { id: studentId, fullName: student!.full_name, active };
}

export async function renameStudent(
  db: D1Database,
  teacherId: number,
  studentId: number,
  fullName: string,
): Promise<{ id: number; fullName: string } | null> {
  const row = await db
    .prepare('UPDATE students SET full_name = ? WHERE id = ? AND teacher_id = ? RETURNING id')
    .bind(fullName, studentId, teacherId)
    .first<{ id: number }>();
  return row ? { id: row.id, fullName } : null;
}
```

- [ ] **Step 6: Replace `server/routes/classes.ts`**

```ts
import { Hono } from 'hono';
import { addStudentsBody, createClassBody, setEnrollmentBody, updateClassBody } from '../../shared/api.ts';
import { isValidSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { createClass, getClass, listClasses, listClassStudents, updateClass } from '../db/classes.ts';
import { addStudentsToClass, setEnrollmentActive } from '../db/students.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';

// /api/admin/classes
export function classRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const raw = c.req.query('year');
    const year = raw === undefined ? schoolYearOf(new Date()) : Number(raw);
    if (!isValidSchoolYear(year)) throw new ApiError(400, 'invalid', 'Anul școlar nu este valid.');
    return c.json({ classes: await listClasses(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createClassBody);
    const created = await createClass(c.env.DB, c.var.teacher.id, body.name, body.schoolYear, nowIso());
    return c.json({ class: created }, 201);
  });

  routes.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const found = await getClass(c.env.DB, c.var.teacher.id, id);
    if (!found) throw notFound();
    return c.json({ class: found, students: await listClassStudents(c.env.DB, id) });
  });

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, updateClassBody);
    return c.json({ class: await updateClass(c.env.DB, c.var.teacher.id, id, body) });
  });

  routes.post('/:id/students', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, addStudentsBody);
    if (!(await getClass(c.env.DB, c.var.teacher.id, id))) throw notFound();
    const students = await addStudentsToClass(c.env.DB, c.var.teacher.id, id, body.names, nowIso());
    return c.json({ students }, 201);
  });

  routes.patch('/:id/students/:studentId', async (c) => {
    const id = parseId(c.req.param('id'));
    const studentId = parseId(c.req.param('studentId'));
    const body = await readJson(c, setEnrollmentBody);
    const student = await setEnrollmentActive(c.env.DB, c.var.teacher.id, id, studentId, body.active);
    if (!student) throw notFound();
    return c.json({ student });
  });

  return routes;
}
```

- [ ] **Step 7: Create `server/routes/students.ts`**

```ts
import { Hono } from 'hono';
import { renameStudentBody } from '../../shared/api.ts';
import { renameStudent } from '../db/students.ts';
import type { AppEnv } from '../env.ts';
import { notFound } from '../errors.ts';
import { parseId, readJson } from '../http.ts';

// /api/admin/students
export function studentRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, renameStudentBody);
    const student = await renameStudent(c.env.DB, c.var.teacher.id, id, body.fullName);
    if (!student) throw notFound();
    return c.json({ student });
  });

  return routes;
}
```

- [ ] **Step 8: Replace `server/routes/admin.ts`**

```ts
import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv } from '../env.ts';
import { sameOriginWrites } from '../http.ts';
import { classRoutes } from './classes.ts';
import { studentRoutes } from './students.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login.
export function adminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth());
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher }));
  routes.route('/classes', classRoutes());
  routes.route('/students', studentRoutes());
  return routes;
}
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  10 passed (10)`, `Tests  62 passed (62)`.

- [ ] **Step 10: Run the typecheck**

Run: `npm run typecheck`
Expected: exit code 0.

- [ ] **Step 11: Commit**

```bash
git add server
git commit -m "Add the students API: add many, rename, left and back"
```

---

### Task 6: Teacher app shell and the classes page

The teacher app runs at `/admin/`: header with the Laura Miron brand, school-year switch, theme switch, and footer with the teacher's name; the classes page lists, adds, and archives classes. The landing page at `/` links to it. An expired Access login reloads the page (at most once per 10 seconds), so Access can show its login.

**Files:**
- Create: `vite.config.ts`, `index.html`, `admin/index.html`, `public/theme.js`, `public/favicon.svg`
- Create: `src/ui/brand.css`, `src/ui/BrandMark.tsx`, `src/ui/ThemeButton.tsx`, `src/ui/theme.ts`, `src/ui/format.ts`
- Create: `src/admin/api.ts`, `src/admin/ApiContext.tsx`, `src/admin/SchoolYearContext.tsx`, `src/admin/ErrorMessage.tsx`, `src/admin/Layout.tsx`, `src/admin/AppRoutes.tsx`, `src/admin/App.tsx`, `src/admin/main.tsx`, `src/admin/pages/NotFoundPage.tsx`, `src/admin/pages/ClassesPage.tsx`
- Create: `src/test/fakeApi.ts`, `src/test/renderAdmin.tsx`
- Test: `src/ui/theme.test.ts`, `src/ui/format.test.ts`, `src/admin/api.test.ts`, `src/admin/pages/ClassesPage.test.tsx`

**Interfaces:**
- Consumes: response types and rules from `shared/` (Tasks 1 and 4); the HTTP API from Tasks 3–5.
- Produces:
  - `interface AdminApi { me(); listClasses(schoolYear); createClass(input); getClass(classId); updateClass(classId, input); addStudents(classId, names); setStudentActive(classId, studentId, active); renameStudent(studentId, fullName) }`, `createApiClient(options?: { fetchImpl?; onLoginExpired? }): AdminApi`, `class ApiError { status; code }`, `class LoginExpiredError`, `reloadForLogin()` in `src/admin/api.ts`.
  - `ApiProvider`, `useApi()`; `SchoolYearProvider({ initialYear? })`, `useSchoolYear(): { year; setYear }`, `schoolYearOptions(current): number[]`; `ErrorMessage({ error })`; `Layout`; `AppRoutes`; `App({ api })`.
  - Test helpers: `createFakeApi(data?: { classes: ClassSummary[]; students: Record<number, StudentRow[]> })` (every method is a `vi.fn`), `renderAdmin(path, api)` (school year 2026, `MemoryRouter` without the `/admin` basename).
  - `studentCountLabel(count): string` ("1 elev", "2 elevi", "20 de elevi", "niciun elev") in `src/ui/format.ts`.
  - CSS classes for later pages: `.button`, `.button-quiet`, `.button-small`, `.form-row`, `.form-stack`, `.hint`, `.alert`, `.alert-text`, `.tag`, `.card-list`, `.card`, `.card-title`, `.is-muted`, `.row-list`, `.row-name`.

- [ ] **Step 1: Create `src/ui/theme.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { currentTheme, otherTheme, saveTheme, storedTheme, THEME_KEY } from './theme.ts';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme', () => {
  it('uses the saved choice before the system setting', () => {
    expect(currentTheme('light', true)).toBe('light');
    expect(currentTheme(null, true)).toBe('dark');
    expect(currentTheme(null, false)).toBe('light');
  });

  it('switches to the other theme', () => {
    expect(otherTheme('light')).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
  });

  it('saves the choice and applies it to the page', () => {
    saveTheme('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(storedTheme()).toBe('dark');
  });

  it('ignores an unknown saved value', () => {
    localStorage.setItem(THEME_KEY, 'purple');
    expect(storedTheme()).toBeNull();
  });
});
```

- [ ] **Step 2: Create `src/ui/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { studentCountLabel } from './format.ts';

describe('studentCountLabel', () => {
  it('uses Romanian number words', () => {
    expect(studentCountLabel(0)).toBe('niciun elev');
    expect(studentCountLabel(1)).toBe('1 elev');
    expect(studentCountLabel(2)).toBe('2 elevi');
    expect(studentCountLabel(19)).toBe('19 elevi');
    expect(studentCountLabel(20)).toBe('20 de elevi');
    expect(studentCountLabel(28)).toBe('28 de elevi');
    expect(studentCountLabel(101)).toBe('101 elevi');
    expect(studentCountLabel(200)).toBe('200 de elevi');
  });
});
```

- [ ] **Step 3: Create `src/admin/api.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, LoginExpiredError } from './api.ts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createApiClient', () => {
  it('asks for the classes of a school year and returns them', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { classes: [{ id: 1, name: '6E2' }] }));
    const api = createApiClient({ fetchImpl });
    expect(await api.listClasses(2026)).toEqual([{ id: 1, name: '6E2' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/admin/classes?year=2026',
      expect.objectContaining({ method: 'GET', redirect: 'manual', credentials: 'same-origin' }),
    );
  });

  it('sends JSON bodies', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(201, { class: { id: 2, name: '7E2' } }),
    );
    const api = createApiClient({ fetchImpl });
    await api.createClass({ name: '7e2', schoolYear: 2026 });
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: '7e2', schoolYear: 2026 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('turns an error answer into an ApiError with the server message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: 'class_exists', message: 'Clasa 6E2 există deja în anul școlar 2026-2027.' }),
    );
    const api = createApiClient({ fetchImpl });
    const error = await api.createClass({ name: '6E2', schoolYear: 2026 }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'class_exists', message: 'Clasa 6E2 există deja în anul școlar 2026-2027.' });
  });

  it('reloads for a new login when Access redirects', async () => {
    const redirect = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as Response;
    const onLoginExpired = vi.fn();
    const api = createApiClient({ fetchImpl: vi.fn(async () => redirect), onLoginExpired });
    await expect(api.me()).rejects.toBeInstanceOf(LoginExpiredError);
    expect(onLoginExpired).toHaveBeenCalledTimes(1);
  });

  it('reports a non-JSON server error without reloading', async () => {
    const onLoginExpired = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const api = createApiClient({ fetchImpl, onLoginExpired });
    await expect(api.me()).rejects.toMatchObject({ code: 'bad_response' });
    expect(onLoginExpired).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Create `src/test/fakeApi.ts`**

```ts
import { vi } from 'vitest';
import type { ClassSummary, StudentRow } from '../../shared/api.ts';
import { normalizeClassName } from '../../shared/classes.ts';
import { ApiError, type AdminApi } from '../admin/api.ts';

// An in-memory AdminApi for page tests. Every method is a vi.fn, so tests can
// check calls or replace one answer with mockRejectedValueOnce.
export interface FakeData {
  classes: ClassSummary[];
  students: Record<number, StudentRow[]>;
}

export function createFakeApi(data: FakeData = { classes: [], students: {} }) {
  let nextId = 1000;
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;

  const api = {
    me: vi.fn(async () => ({ id: 1, email: 'profesor@example.com', name: 'Laura Miron' })),
    listClasses: vi.fn(async (schoolYear: number) =>
      data.classes.filter((c) => c.schoolYear === schoolYear).map((c) => ({ ...c, studentCount: countActive(c.id) })),
    ),
    createClass: vi.fn(async (input: { name: string; schoolYear: number }) => {
      const name = normalizeClassName(input.name);
      if (!name) throw new ApiError(400, 'invalid', 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
      const created: ClassSummary = { id: nextId++, name, schoolYear: input.schoolYear, archived: false, studentCount: 0 };
      data.classes.push(created);
      return created;
    }),
    getClass: vi.fn(async (classId: number) => {
      const found = data.classes.find((c) => c.id === classId);
      if (!found) throw new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
      return { class: { ...found, studentCount: countActive(classId) }, students: [...(data.students[classId] ?? [])] };
    }),
    updateClass: vi.fn(async (classId: number, input: { name?: string; archived?: boolean }) => {
      const found = data.classes.find((c) => c.id === classId)!;
      if (input.name !== undefined) found.name = normalizeClassName(input.name) ?? found.name;
      if (input.archived !== undefined) found.archived = input.archived;
      return { ...found };
    }),
    addStudents: vi.fn(async (classId: number, names: string[]) => {
      const added = names.map((fullName) => ({ id: nextId++, fullName, active: true }));
      data.students[classId] = [...(data.students[classId] ?? []), ...added];
      return added;
    }),
    setStudentActive: vi.fn(async (classId: number, studentId: number, active: boolean) => {
      const student = data.students[classId]!.find((s) => s.id === studentId)!;
      student.active = active;
      return { ...student };
    }),
    renameStudent: vi.fn(async (studentId: number, fullName: string) => {
      for (const list of Object.values(data.students)) {
        const student = list.find((s) => s.id === studentId);
        if (student) student.fullName = fullName;
      }
      return { id: studentId, fullName };
    }),
  } satisfies AdminApi;
  return api;
}

export type FakeApi = ReturnType<typeof createFakeApi>;
```

- [ ] **Step 5: Create `src/test/renderAdmin.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ApiProvider } from '../admin/ApiContext.tsx';
import type { AdminApi } from '../admin/api.ts';
import { AppRoutes } from '../admin/AppRoutes.tsx';
import { SchoolYearProvider } from '../admin/SchoolYearContext.tsx';

// Renders the teacher app at a path (without the /admin basename), with a fake
// API and school year 2026-2027.
export function renderAdmin(path: string, api: AdminApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider initialYear={2026}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
}
```

- [ ] **Step 6: Create `src/admin/pages/ClassesPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const twoClasses = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
      { id: 3, name: '5A', schoolYear: 2027, archived: false, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true }] },
  });

describe('ClassesPage', () => {
  it('opens on the classes of the selected school year', async () => {
    const api = twoClasses();
    renderAdmin('/', api);
    expect(await screen.findByRole('heading', { name: 'Clase 2026-2027' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByText('1 elev')).toBeInTheDocument();
    expect(screen.getByText('Arhivată')).toBeInTheDocument();
    expect(screen.queryByText('Clasa 5A')).not.toBeInTheDocument();
    expect(api.listClasses).toHaveBeenCalledWith(2026);
  });

  it('shows the teacher name in the footer', async () => {
    renderAdmin('/clase', twoClasses());
    expect(await screen.findByText('QuickEval · Laura Miron')).toBeInTheDocument();
  });

  it('switches the school year from the header', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    await screen.findByRole('heading', { name: 'Clase 2026-2027' });
    await userEvent.selectOptions(screen.getByLabelText('Anul școlar'), '2027');
    expect(await screen.findByRole('heading', { name: 'Clase 2027-2028' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Clasa 5A' })).toBeInTheDocument();
  });

  it('adds a class in the selected school year', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    await userEvent.type(await screen.findByLabelText('Clasă nouă'), '7e2');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă clasa' }));
    expect(api.createClass).toHaveBeenCalledWith({ name: '7e2', schoolYear: 2026 });
    expect(await screen.findByRole('link', { name: 'Clasa 7E2' })).toBeInTheDocument();
    expect(screen.getByLabelText('Clasă nouă')).toHaveValue('');
  });

  it('shows the server message when the class already exists', async () => {
    const api = twoClasses();
    api.createClass.mockRejectedValueOnce(
      new ApiError(409, 'class_exists', 'Clasa 6E2 există deja în anul școlar 2026-2027.'),
    );
    renderAdmin('/clase', api);
    await userEvent.type(await screen.findByLabelText('Clasă nouă'), '6E2');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă clasa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clasa 6E2 există deja în anul școlar 2026-2027.');
  });

  it('archives a class and brings it back', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    const card = (await screen.findByRole('link', { name: 'Clasa 6E2' })).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Arhivează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { archived: true });
    expect(await within(card).findByRole('button', { name: 'Scoate din arhivă' })).toBeInTheDocument();
  });

  it('says so when the year has no classes', async () => {
    renderAdmin('/clase', createFakeApi());
    expect(await screen.findByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the tests to see them fail**

Run: `npx vitest run --project web`
Expected: FAIL. All 4 test files fail with errors like `Failed to resolve import "./theme.ts" from "src/ui/theme.test.ts". Does the file exist?` (also for `./format.ts`, `./api.ts`, and `../api.ts`). `Tests  no tests`.

- [ ] **Step 8: Create `src/ui/theme.ts`**

```ts
export type Theme = 'light' | 'dark';

// Keep equal to the key in public/theme.js.
export const THEME_KEY = 'quickeval.theme';

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

// The theme on screen: the reader's choice, else the system setting.
export function currentTheme(stored: Theme | null, systemPrefersDark: boolean): Theme {
  return stored ?? (systemPrefersDark ? 'dark' : 'light');
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function saveTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
```

- [ ] **Step 9: Create `src/ui/format.ts`**

```ts
// Romanian counts: "1 elev", "2 elevi", "20 de elevi" (20 or more, and round
// hundreds, take "de").
export function studentCountLabel(count: number): string {
  if (count === 0) return 'niciun elev';
  if (count === 1) return '1 elev';
  const lastTwo = count % 100;
  return lastTwo >= 20 || lastTwo === 0 ? `${count} de elevi` : `${count} elevi`;
}
```

- [ ] **Step 10: Create `src/admin/api.ts`**

```ts
import type { ClassDetail, ClassSummary, CreateClassInput, StudentRow, Teacher, UpdateClassInput } from '../../shared/api.ts';

// Everything the teacher app asks the server. Pages get it from useApi(), so
// tests can pass a fake.
export interface AdminApi {
  me(): Promise<Teacher>;
  listClasses(schoolYear: number): Promise<ClassSummary[]>;
  createClass(input: CreateClassInput): Promise<ClassSummary>;
  getClass(classId: number): Promise<ClassDetail>;
  updateClass(classId: number, input: UpdateClassInput): Promise<ClassSummary>;
  addStudents(classId: number, names: string[]): Promise<StudentRow[]>;
  setStudentActive(classId: number, studentId: number, active: boolean): Promise<StudentRow>;
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
}

// An error answer from the API, with its Romanian message.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The Cloudflare Access login ended. The app reloads the page so Access shows
// its login screen.
export class LoginExpiredError extends Error {
  constructor() {
    super('Sesiunea a expirat. Reîncarcă pagina ca să intri din nou.');
  }
}

const RELOAD_KEY = 'quickeval.loginReloadAt';
const RELOAD_GAP_MS = 10_000;

// Reloads at most once per 10 seconds, so a broken login can never cause a reload loop.
export function reloadForLogin(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GAP_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  onLoginExpired?: () => void;
}

export function createApiClient(options: ApiClientOptions = {}): AdminApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const onLoginExpired = options.onLoginExpired ?? reloadForLogin;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(`/api/admin${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      // An expired Access session answers with a redirect to the login page on
      // another origin. 'manual' turns it into an opaqueredirect response here.
      redirect: 'manual',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const isJson = (res.headers.get('Content-Type') ?? '').includes('application/json');
    if (res.type === 'opaqueredirect' || ((res.status === 401 || res.status === 403) && !isJson)) {
      onLoginExpired();
      throw new LoginExpiredError();
    }
    if (!isJson) {
      throw new ApiError(res.status, 'bad_response', 'Serverul nu a răspuns corect. Încearcă din nou.');
    }
    const data = (await res.json()) as { error?: string; message?: string };
    if (!res.ok) {
      throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'A apărut o eroare. Încearcă din nou.');
    }
    return data as T;
  }

  return {
    me: async () => (await request<{ teacher: Teacher }>('GET', '/me')).teacher,
    listClasses: async (schoolYear) =>
      (await request<{ classes: ClassSummary[] }>('GET', `/classes?year=${schoolYear}`)).classes,
    createClass: async (input) => (await request<{ class: ClassSummary }>('POST', '/classes', input)).class,
    getClass: (classId) => request<ClassDetail>('GET', `/classes/${classId}`),
    updateClass: async (classId, input) =>
      (await request<{ class: ClassSummary }>('PATCH', `/classes/${classId}`, input)).class,
    addStudents: async (classId, names) =>
      (await request<{ students: StudentRow[] }>('POST', `/classes/${classId}/students`, { names })).students,
    setStudentActive: async (classId, studentId, active) =>
      (await request<{ student: StudentRow }>('PATCH', `/classes/${classId}/students/${studentId}`, { active })).student,
    renameStudent: async (studentId, fullName) =>
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
  };
}
```

- [ ] **Step 11: Create `src/ui/brand.css`**

The colours, fonts, header, and notebook margin come from the Website's `assets/css/style.css`.

```css
/* QuickEval look, taken from the "Matematică cu Laura Miron" site
   (D:\Projects\Website\assets\css\style.css): a Romanian squared math notebook
   in light mode, a green chalkboard in dark mode. The dark colours are written
   twice because CSS cannot share one block across a media query; keep the two
   copies equal. */

:root {
  --paper: #fbfcfe;
  --grid: #e3eaf4;
  --sheet: #ffffff;
  --text: #24272d;
  --muted: #586070;
  --ink: #1d3c8f;
  --ink-hover: #132a69;
  --red: #cf3a2f;
  --marker: #fff0a0;
  --marker-edge: #ffd94a;
  --rule: #d4dce8;
  --brand-marker: #fff0a0;
  --ok-bg: #e1f2e8;
  --ok-fg: #1b6b43;
  --error-bg: #fbe5e2;
  --error-fg: #a52a20;
  --cell: 24px;
  --margin-x: 3rem;
  --font: "Atkinson Hyperlegible Next", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
  --hand: "Caveat", "Segoe Print", "Bradley Hand", cursive;
  color-scheme: light;
}

:root[data-theme="dark"] {
  --paper: #1d2925;
  --grid: rgba(255, 255, 255, 0.045);
  --sheet: #22302b;
  --text: #e8ece7;
  --muted: #b1bab3;
  --ink: #a9c5ff;
  --ink-hover: #d2e0ff;
  --red: #ff8b80;
  --marker: rgba(255, 226, 110, 0.16);
  --marker-edge: rgba(255, 217, 74, 0.75);
  --rule: rgba(255, 255, 255, 0.14);
  --brand-marker: rgba(255, 217, 74, 0.5);
  --ok-bg: rgba(120, 210, 160, 0.16);
  --ok-fg: #a8e6c1;
  --error-bg: rgba(255, 139, 128, 0.16);
  --error-fg: #ffb3ab;
  color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #1d2925;
    --grid: rgba(255, 255, 255, 0.045);
    --sheet: #22302b;
    --text: #e8ece7;
    --muted: #b1bab3;
    --ink: #a9c5ff;
    --ink-hover: #d2e0ff;
    --red: #ff8b80;
    --marker: rgba(255, 226, 110, 0.16);
    --marker-edge: rgba(255, 217, 74, 0.75);
    --rule: rgba(255, 255, 255, 0.14);
    --brand-marker: rgba(255, 217, 74, 0.5);
    --ok-bg: rgba(120, 210, 160, 0.16);
    --ok-fg: #a8e6c1;
    --error-bg: rgba(255, 139, 128, 0.16);
    --error-fg: #ffb3ab;
    color-scheme: dark;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
  scrollbar-gutter: stable;
}

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: var(--font);
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--text);
  background-color: var(--paper);
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: var(--cell) var(--cell);
}

#root {
  display: flex;
  flex: 1;
  flex-direction: column;
}

main {
  flex: 1;
}

a {
  color: var(--ink);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}

a:hover {
  color: var(--ink-hover);
  text-decoration-thickness: 2px;
}

:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 3px;
  border-radius: 2px;
}

[hidden] {
  display: none !important;
}

h1 {
  margin: 0 0 0.75rem;
  font-size: clamp(1.5rem, 1rem + 2vw, 2.2rem);
  font-weight: 800;
  line-height: 1.2;
}

h2 {
  margin: 1.75rem 0 0.5rem;
  font-size: 1.3rem;
  font-weight: 800;
}

.wrap {
  width: 100%;
  max-width: 70rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Header */

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--rule);
  background: var(--sheet);
}

.header-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  padding-block: 0.55rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-right: auto;
  line-height: 1.2;
  text-decoration: none;
  color: var(--ink);
}

.brand-mark {
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-size: 1.15rem;
  font-weight: 800;
}

.brand-sub {
  font-size: 0.8rem;
  color: var(--muted);
}

.main-nav {
  display: flex;
  gap: 0.25rem;
}

.main-nav a {
  padding: 0.35rem 0.75rem;
  border: 2px solid transparent;
  border-radius: 999px;
  font-family: var(--hand);
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
}

.main-nav a[aria-current="page"] {
  border-color: var(--red);
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.theme-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  min-height: 2.5rem;
  padding: 0;
  border: 1.5px solid var(--rule);
  border-radius: 999px;
  background: var(--sheet);
  color: var(--ink);
  cursor: pointer;
}

.theme-btn:hover {
  border-color: var(--ink);
}

.theme-icon {
  width: 1.2rem;
  height: 1.2rem;
}

/* Page body with the notebook's red margin line */

.page {
  position: relative;
  padding-block: 1.25rem 2.5rem;
  padding-left: var(--margin-x);
}

.page::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--margin-x) - 1.25rem);
  width: 2px;
  background: var(--red);
  opacity: 0.7;
}

@media (max-width: 40rem) {
  :root {
    --margin-x: 1.75rem;
  }
}

.site-footer {
  border-top: 1px solid var(--rule);
  background: var(--sheet);
  color: var(--muted);
  font-size: 0.9rem;
}

.site-footer p {
  margin: 0;
  padding-block: 0.75rem;
}

/* Buttons and forms */

.button,
.button-quiet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.45rem 1.15rem;
  border-radius: 999px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.button {
  border: 0;
  background: var(--ink);
  color: var(--sheet);
}

.button:hover {
  background: var(--ink-hover);
  color: var(--sheet);
}

.button-quiet {
  border: 1.5px solid var(--rule);
  background: var(--sheet);
  color: var(--ink);
}

.button-quiet:hover {
  border-color: var(--ink);
}

.button-small {
  min-height: 2.25rem;
  padding: 0.2rem 0.85rem;
  font-size: 0.9rem;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

label {
  font-weight: 700;
}

input[type="text"],
textarea,
select {
  min-height: 2.75rem;
  padding: 0.45rem 0.75rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.5rem;
  background: var(--sheet);
  color: var(--text);
  font: inherit;
}

input[type="text"]:focus,
textarea:focus,
select:focus {
  border-color: var(--ink);
  outline: 3px solid var(--ink);
  outline-offset: 1px;
}

textarea {
  width: 100%;
  max-width: 34rem;
  min-height: 9rem;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-block: 0.75rem;
}

.form-stack {
  display: grid;
  gap: 0.5rem;
  margin-block: 0.75rem;
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}

.alert {
  max-width: 40rem;
  margin-block: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--error-fg);
  border-radius: 0.35rem;
  background: var(--error-bg);
  color: var(--error-fg);
}

.alert-text {
  margin: 0;
}

.tag {
  display: inline-block;
  padding: 0 0.55rem;
  border-radius: 999px;
  background: var(--marker);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
}

/* Lists */

.card-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.9rem 1rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
}

.card.is-muted {
  opacity: 0.7;
}

.card-title {
  font-size: 1.2rem;
  font-weight: 800;
}

.row-list {
  max-width: 44rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
  counter-reset: row;
}

.row-list > li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--rule);
  counter-increment: row;
}

.row-list > li::before {
  content: counter(row) ".";
  min-width: 2rem;
  color: var(--muted);
}

.row-list .row-name {
  margin-right: auto;
}

.row-list > li.is-muted .row-name {
  color: var(--muted);
  text-decoration: line-through;
}

/* Landing page */

.landing {
  max-width: 40rem;
}

.landing .lead {
  font-size: 1.2rem;
}
```

- [ ] **Step 12: Create `src/ui/BrandMark.tsx`**

```tsx
// Laura Miron's initials over a highlighter stroke, as in the Website header.
// Coloured by --ink (currentColor) and --brand-marker, so both themes work.
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M10 48h44" fill="none" stroke="var(--brand-marker)" strokeWidth="12" strokeLinecap="round" />
      <g fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M25 13c-3 11-6 21-9 31 7 0 13-2 18-6" />
        <path d="M33 45l4-23 6 13 8-15 2 25" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 13: Create `src/ui/ThemeButton.tsx`**

```tsx
import { useState } from 'react';
import { currentTheme, otherTheme, saveTheme, storedTheme, systemPrefersDark } from './theme.ts';

// Shows a moon in light mode and a sun in dark mode: the icon offers the other theme.
export function ThemeButton() {
  const [theme, setTheme] = useState(() => currentTheme(storedTheme(), systemPrefersDark()));
  const next = otherTheme(theme);
  return (
    <button
      type="button"
      className="theme-btn"
      aria-label={next === 'dark' ? 'Temă întunecată' : 'Temă luminoasă'}
      onClick={() => {
        saveTheme(next);
        setTheme(next);
      }}
    >
      {next === 'dark' ? (
        <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M20 14.5 A8.5 8.5 0 0 1 9.5 4 a8.5 8.5 0 1 0 10.5 10.5 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2.5 v2.2 M12 19.3 v2.2 M2.5 12 h2.2 M19.3 12 h2.2" />
            <path d="M5.3 5.3 l1.6 1.6 M17.1 17.1 l1.6 1.6 M18.7 5.3 l-1.6 1.6 M6.9 17.1 l-1.6 1.6" />
          </g>
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 14: Create `src/admin/ApiContext.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { AdminApi } from './api.ts';

const ApiContext = createContext<AdminApi | null>(null);

export function ApiProvider({ api, children }: { api: AdminApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): AdminApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi() needs an <ApiProvider> above it');
  return api;
}
```

- [ ] **Step 15: Create `src/admin/SchoolYearContext.tsx`**

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';
import { isValidSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';

const YEAR_KEY = 'quickeval.schoolYear';
// QuickEval starts in school year 2026-2027; no data exists before it.
const FIRST_YEAR = 2026;

interface SchoolYearState {
  year: number;
  setYear(year: number): void;
}

const SchoolYearContext = createContext<SchoolYearState | null>(null);

// The years the header switch offers: next year (for preparing classes in
// summer) down to the first QuickEval year, newest first.
export function schoolYearOptions(current: number): number[] {
  const years: number[] = [];
  for (let year = current + 1; year >= Math.min(FIRST_YEAR, current); year--) years.push(year);
  return years;
}

function savedYear(): number | null {
  try {
    const year = Number(localStorage.getItem(YEAR_KEY));
    return isValidSchoolYear(year) ? year : null;
  } catch {
    return null;
  }
}

export function SchoolYearProvider({ initialYear, children }: { initialYear?: number; children: ReactNode }) {
  const [year, setYearState] = useState(() => initialYear ?? savedYear() ?? schoolYearOf(new Date()));
  const setYear = (next: number) => {
    setYearState(next);
    try {
      localStorage.setItem(YEAR_KEY, String(next));
    } catch {
      // Storage can be blocked; the choice then lasts until the page reloads.
    }
  };
  return <SchoolYearContext.Provider value={{ year, setYear }}>{children}</SchoolYearContext.Provider>;
}

export function useSchoolYear(): SchoolYearState {
  const state = useContext(SchoolYearContext);
  if (!state) throw new Error('useSchoolYear() needs a <SchoolYearProvider> above it');
  return state;
}
```

- [ ] **Step 16: Create `src/admin/ErrorMessage.tsx`**

```tsx
import { LoginExpiredError } from './api.ts';

// Shows the Romanian message of a failed request. An expired login also gets
// a button that reloads the page, in case the automatic reload was skipped.
export function ErrorMessage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'A apărut o eroare. Încearcă din nou.';
  return (
    <div className="alert" role="alert">
      <p className="alert-text">{message}</p>
      {error instanceof LoginExpiredError && (
        <button type="button" className="button-quiet button-small" onClick={() => window.location.reload()}>
          Reîncarcă pagina
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 17: Create `src/admin/Layout.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router';
import { formatSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useApi } from './ApiContext.tsx';
import { ErrorMessage } from './ErrorMessage.tsx';
import { schoolYearOptions, useSchoolYear } from './SchoolYearContext.tsx';

export function Layout() {
  const api = useApi();
  const { year, setYear } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });

  return (
    <>
      <header className="site-header">
        <div className="wrap header-bar">
          <Link className="brand" to="/">
            <BrandMark />
            <span className="brand-text">
              <span className="brand-name">QuickEval</span>
              <span className="brand-sub">Matematică cu Laura Miron</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="Meniu">
            <NavLink to="/clase">Clase</NavLink>
          </nav>
          <div className="header-tools">
            <label className="sr-only" htmlFor="school-year">
              Anul școlar
            </label>
            <select id="school-year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {schoolYearOptions(schoolYearOf(new Date())).map((option) => (
                <option key={option} value={option}>
                  {formatSchoolYear(option)}
                </option>
              ))}
            </select>
            <ThemeButton />
          </div>
        </div>
      </header>
      <main className="wrap page">
        {me.error ? <ErrorMessage error={me.error} /> : <Outlet />}
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>QuickEval{me.data ? ` · ${me.data.name}` : ''}</p>
        </div>
      </footer>
    </>
  );
}
```

- [ ] **Step 18: Create `src/admin/pages/NotFoundPage.tsx`**

```tsx
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section>
      <h1>Pagina nu există</h1>
      <p>
        <Link to="/clase">Mergi la clase</Link>
      </p>
    </section>
  );
}
```

- [ ] **Step 19: Create `src/admin/pages/ClassesPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ClassSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

export function ClassesPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { year } = useSchoolYear();
  const [name, setName] = useState('');

  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['classes', year] });

  const create = useMutation({
    mutationFn: () => api.createClass({ name, schoolYear: year }),
    onSuccess: async () => {
      setName('');
      await refresh();
    },
  });

  const archive = useMutation({
    mutationFn: (item: ClassSummary) => api.updateClass(item.id, { archived: !item.archived }),
    onSuccess: refresh,
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <section>
      <h1>Clase {formatSchoolYear(year)}</h1>

      <form className="form-row" onSubmit={onSubmit}>
        <label htmlFor="class-name">Clasă nouă</label>
        <input
          id="class-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="de exemplu 6E2"
          maxLength={20}
          required
        />
        <button className="button" type="submit" disabled={create.isPending}>
          Adaugă clasa
        </button>
      </form>
      {create.error && <ErrorMessage error={create.error} />}
      {archive.error && <ErrorMessage error={archive.error} />}

      {classes.isPending && <p>Se încarcă…</p>}
      {classes.error && <ErrorMessage error={classes.error} />}
      {classes.data && classes.data.length === 0 && <p className="hint">Nu ai nicio clasă în acest an școlar.</p>}
      {classes.data && classes.data.length > 0 && (
        <ul className="card-list">
          {classes.data.map((item) => (
            <li key={item.id} className={item.archived ? 'card is-muted' : 'card'}>
              <Link className="card-title" to={`/clase/${item.id}`}>
                {displayClassName(item.name)}
              </Link>
              <span>{studentCountLabel(item.studentCount)}</span>
              {item.archived && <span className="tag">Arhivată</span>}
              <span>
                <button
                  type="button"
                  className="button-quiet button-small"
                  onClick={() => archive.mutate(item)}
                  disabled={archive.isPending}
                >
                  {item.archived ? 'Scoate din arhivă' : 'Arhivează'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 20: Create `src/admin/AppRoutes.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './Layout.tsx';
import { ClassesPage } from './pages/ClassesPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

// Paths are relative to the /admin basename set in App.tsx.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/clase" replace />} />
        <Route path="clase" element={<ClassesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 21: Create `src/admin/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter } from 'react-router';
import { ApiProvider } from './ApiContext.tsx';
import type { AdminApi } from './api.ts';
import { AppRoutes } from './AppRoutes.tsx';
import { SchoolYearProvider } from './SchoolYearContext.tsx';

export function App({ api }: { api: AdminApi }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider>
          <BrowserRouter basename="/admin">
            <AppRoutes />
          </BrowserRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
```

- [ ] **Step 22: Create `src/admin/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/brand.css';
import { createApiClient } from './api.ts';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={createApiClient()} />
  </StrictMode>,
);
```

- [ ] **Step 23: Run the tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  14 passed (14)`, `Tests  79 passed (79)`.

- [ ] **Step 24: Create `vite.config.ts`**

```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `npm run dev:api` serves the API (wrangler pages dev) here.
const API_ORIGIN = 'http://127.0.0.1:8788';

// The teacher app is a single-page app under /admin/. In dev, every /admin page
// request gets admin/index.html, the same as public/_redirects does on Pages.
function adminFallback(): Plugin {
  return {
    name: 'quickeval-admin-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        if (path === '/admin' || (path.startsWith('/admin/') && !path.includes('.'))) {
          req.url = '/admin/index.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), adminFallback()],
  appType: 'mpa',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: page('./index.html'),
        admin: page('./admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_ORIGIN,
        // Keep the browser's Host header. The API then sees the page's own
        // origin (localhost:5173) and accepts its writes (sameOriginWrites).
        changeOrigin: false,
      },
    },
  },
});
```

- [ ] **Step 25: Create `public/theme.js`**

```js
// Runs in the page head, before the stylesheet, so the page never paints the
// wrong theme first. Keep the storage key equal to THEME_KEY in src/ui/theme.ts.
(function () {
  try {
    var theme = localStorage.getItem('quickeval.theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    // Storage can be blocked; the system theme then applies.
  }
})();
```

- [ ] **Step 26: Create `public/favicon.svg`**

The same file as `D:\Projects\Website\favicon.svg`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <title>Laura Miron</title>
  <rect width="64" height="64" rx="14" fill="#1d3c8f"/>
  <g transform="translate(32 31) scale(0.95) translate(-32 -30)">
    <path d="M13 45h38" fill="none" stroke="#ffd94a" stroke-width="7" stroke-linecap="round"/>
    <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M25 13c-3 11-6 21-9 31 7 0 13-2 18-6"/>
      <path d="M33 45l4-23 6 13 8-15 2 25"/>
    </g>
  </g>
</svg>
```

- [ ] **Step 27: Create `admin/index.html`**

```html
<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>QuickEval · Profesor</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script src="/theme.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,700;0,800;1,400&family=Caveat:wght@600&display=swap"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/admin/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 28: Create `index.html`**

The landing page. Its text does not mention AI.

```html
<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>QuickEval</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script src="/theme.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,700;0,800;1,400&family=Caveat:wght@600&display=swap"
    />
    <link rel="stylesheet" href="/src/ui/brand.css" />
  </head>
  <body>
    <header class="site-header">
      <div class="wrap header-bar">
        <a class="brand" href="/">
          <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M10 48h44" fill="none" stroke="var(--brand-marker)" stroke-width="12" stroke-linecap="round" />
            <g fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M25 13c-3 11-6 21-9 31 7 0 13-2 18-6" />
              <path d="M33 45l4-23 6 13 8-15 2 25" />
            </g>
          </svg>
          <span class="brand-text">
            <span class="brand-name">QuickEval</span>
            <span class="brand-sub">Matematică cu Laura Miron</span>
          </span>
        </a>
      </div>
    </header>
    <main class="wrap page landing">
      <h1>QuickEval</h1>
      <p class="lead">Corectarea testelor la matematică, rapid și în ordine.</p>
      <p><a class="button" href="/admin/">Intră ca profesor</a></p>
    </main>
    <footer class="site-footer">
      <div class="wrap"><p>QuickEval · Matematică cu Laura Miron</p></div>
    </footer>
  </body>
</html>
```

- [ ] **Step 29: Run the typecheck and the build**

Run: `npm run build`
Expected: exit code 0. Vite prints `dist/admin/index.html`, `dist/index.html`, one `dist/assets/brand-*.css`, one `dist/assets/admin-*.js`, and `✓ built in …`. No warnings.

- [ ] **Step 30: Commit**

```bash
git add vite.config.ts index.html admin public src
git commit -m "Add the teacher app shell and the classes page"
```

---

### Task 7: Class page with its students

The class page shows the class name and school year, renames the class, lists its students in Romanian alphabetical order (students who left are marked "a plecat"), adds pasted names (numbers at line starts are removed), renames a student, and marks a student as left or back.

**Files:**
- Create: `src/admin/pages/ClassPage.tsx`
- Replace: `src/admin/AppRoutes.tsx`
- Test: `src/admin/pages/ClassPage.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `ErrorMessage`, `NotFoundPage`, `studentCountLabel`, `parseStudentNames`, `MAX_NAMES_PER_REQUEST`, `createFakeApi`, `renderAdmin` (Task 6).
- Produces: route `/admin/clase/:id` → `ClassPage`. Query keys used: `['class', classId]`; changes also refresh `['classes']`.

- [ ] **Step 1: Create `src/admin/pages/ClassPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const oneClass = () =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {
      1: [
        { id: 10, fullName: 'Pop Ion', active: true },
        { id: 11, fullName: 'Ionescu Ana', active: false },
      ],
    },
  });

describe('ClassPage', () => {
  it('shows the class and its students, with students who left marked', async () => {
    renderAdmin('/clase/1', oneClass());
    expect(await screen.findByRole('heading', { name: 'Clasa 6E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Elevi (1 elev)' })).toBeInTheDocument();
    const left = screen.getByText('Ionescu Ana').closest('li')!;
    expect(within(left).getByText('a plecat')).toBeInTheDocument();
  });

  it('adds pasted names, one per line, without list numbers', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const box = await screen.findByLabelText('Numele elevilor, câte unul pe rând');
    await userEvent.type(box, '1. Marin Dan{Enter}{Enter}2) Stan Eva');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă 2 elevi' }));
    expect(api.addStudents).toHaveBeenCalledWith(1, ['Marin Dan', 'Stan Eva']);
    expect(await screen.findByText('Marin Dan')).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('marks a student as left', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'A plecat' }));
    expect(api.setStudentActive).toHaveBeenCalledWith(1, 10, false);
    expect(await within(row).findByRole('button', { name: 'Revine în clasă' })).toBeInTheDocument();
  });

  it('renames a student', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Redenumește' }));
    const input = screen.getByLabelText('Numele elevului');
    await userEvent.clear(input);
    await userEvent.type(input, 'Pop Ioan');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameStudent).toHaveBeenCalledWith(10, 'Pop Ioan');
    expect(await screen.findByText('Pop Ioan')).toBeInTheDocument();
  });

  it('renames the class', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește clasa' }));
    const input = screen.getByLabelText('Nume nou');
    await userEvent.clear(input);
    await userEvent.type(input, '6E3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { name: '6E3' });
    expect(await screen.findByRole('heading', { name: 'Clasa 6E3 · 2026-2027' })).toBeInTheDocument();
  });

  it('shows the not-found page for a bad class id', async () => {
    renderAdmin('/clase/abc', oneClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the server message for a class that does not exist', async () => {
    renderAdmin('/clase/999', oneClass());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --project web src/admin/pages/ClassPage.test.tsx`
Expected: FAIL. 6 of the 7 tests fail with `Unable to find …`, for example `Unable to find role="heading" and name "Clasa 6E2 · 2026-2027"`: `/clase/1` still shows the not-found page. The bad-id test already passes.

- [ ] **Step 3: Create `src/admin/pages/ClassPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { StudentRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_NAMES_PER_REQUEST, parseStudentNames } from '../../../shared/students.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function ClassPage() {
  const classId = Number(useParams().id);
  if (!Number.isSafeInteger(classId) || classId <= 0) return <NotFoundPage />;
  return <ClassDetails classId={classId} />;
}

function ClassDetails({ classId }: { classId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, students } = detail.data;
  return (
    <section>
      <p>
        <Link to="/clase">← Toate clasele</Link>
      </p>
      <h1>
        {displayClassName(info.name)} · {formatSchoolYear(info.schoolYear)}
      </h1>
      <RenameClassForm classId={classId} currentName={info.name} onDone={refresh} />

      <h2>Elevi ({studentCountLabel(info.studentCount)})</h2>
      {students.length === 0 ? (
        <p className="hint">Clasa nu are încă elevi. Adaugă-i mai jos.</p>
      ) : (
        <ol className="row-list">
          {students.map((student) => (
            <StudentItem key={student.id} classId={classId} student={student} onChanged={refresh} />
          ))}
        </ol>
      )}

      <h2>Adaugă elevi</h2>
      <AddStudentsForm classId={classId} onDone={refresh} />
    </section>
  );
}

function RenameClassForm({ classId, currentName, onDone }: { classId: number; currentName: string; onDone: () => Promise<void> }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const rename = useMutation({
    mutationFn: () => api.updateClass(classId, { name }),
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });

  if (!open) {
    return (
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(true)}>
        Redenumește clasa
      </button>
    );
  }
  return (
    <form
      className="form-row"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-class">Nume nou</label>
      <input id="rename-class" type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={20} required />
      <button className="button button-small" type="submit" disabled={rename.isPending}>
        Salvează
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(false)}>
        Renunță
      </button>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}

function StudentItem({ classId, student, onChanged }: { classId: number; student: StudentRow; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(student.fullName);

  const toggle = useMutation({
    mutationFn: () => api.setStudentActive(classId, student.id, !student.active),
    onSuccess: onChanged,
  });
  const rename = useMutation({
    mutationFn: () => api.renameStudent(student.id, fullName),
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    },
  });

  if (editing) {
    return (
      <li>
        <form
          className="form-row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            rename.mutate();
          }}
        >
          <label className="sr-only" htmlFor={`student-${student.id}`}>
            Numele elevului
          </label>
          <input id={`student-${student.id}`} type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={80} required />
          <button className="button button-small" type="submit" disabled={rename.isPending}>
            Salvează
          </button>
          <button type="button" className="button-quiet button-small" onClick={() => setEditing(false)}>
            Renunță
          </button>
        </form>
        {rename.error && <ErrorMessage error={rename.error} />}
      </li>
    );
  }

  return (
    <li className={student.active ? undefined : 'is-muted'}>
      <span className="row-name">{student.fullName}</span>
      {!student.active && <span className="tag">a plecat</span>}
      <button type="button" className="button-quiet button-small" onClick={() => setEditing(true)}>
        Redenumește
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
        {student.active ? 'A plecat' : 'Revine în clasă'}
      </button>
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </li>
  );
}

function AddStudentsForm({ classId, onDone }: { classId: number; onDone: () => Promise<void> }) {
  const api = useApi();
  const [text, setText] = useState('');
  const names = parseStudentNames(text);
  const tooMany = names.length > MAX_NAMES_PER_REQUEST;
  const add = useMutation({
    mutationFn: () => api.addStudents(classId, names),
    onSuccess: async () => {
      setText('');
      await onDone();
    },
  });

  return (
    <form
      className="form-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <label htmlFor="student-names">Numele elevilor, câte unul pe rând</label>
      <p className="hint" id="student-names-hint">
        Poți lipi lista din catalog. Numerele de la începutul rândurilor se șterg singure.
      </p>
      <textarea
        id="student-names"
        aria-describedby="student-names-hint"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {tooMany && (
        <p className="alert" role="alert">
          Adaugă cel mult {MAX_NAMES_PER_REQUEST} de nume odată.
        </p>
      )}
      <span>
        <button className="button" type="submit" disabled={names.length === 0 || tooMany || add.isPending}>
          {names.length > 0 ? `Adaugă ${studentCountLabel(names.length)}` : 'Adaugă elevii'}
        </button>
      </span>
      {add.error && <ErrorMessage error={add.error} />}
    </form>
  );
}
```

- [ ] **Step 4: Replace `src/admin/AppRoutes.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './Layout.tsx';
import { ClassesPage } from './pages/ClassesPage.tsx';
import { ClassPage } from './pages/ClassPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

// Paths are relative to the /admin basename set in App.tsx.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/clase" replace />} />
        <Route path="clase" element={<ClassesPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  15 passed (15)`, `Tests  86 passed (86)`.

- [ ] **Step 6: Run the typecheck and the build**

Run: `npm run build`
Expected: exit code 0, no warnings.

- [ ] **Step 7: Commit**

```bash
git add src/admin
git commit -m "Add the class page: students, paste many, rename, left and back"
```

---

### Task 8: Pages files and the local production run

The build gets its Cloudflare Pages files (Functions only for `/api/*`, the `/admin` rewrite, security headers), and the app runs locally the same way it runs on Pages, with a smoke test.

**Files:**
- Create: `public/_routes.json`, `public/_redirects`, `public/_headers`, `public/robots.txt`
- Create: `scripts/seed-local.sql`, `scripts/smoke.mjs`, `.dev.vars.example`, `.claude/launch.json`

**Interfaces:**
- Consumes: the whole app from Tasks 1–7; npm scripts from Task 1.
- Produces: `npm run smoke` (checks a server on `SMOKE_URL`, default `http://127.0.0.1:8788`); preview servers `api`, `web`, `preview` for Claude Code.

- [ ] **Step 1: Create `public/_routes.json`**

```json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
```

- [ ] **Step 2: Create `public/_redirects`**

```text
# The teacher app is a single-page app: every /admin page loads /admin/
# (admin/index.html). Keep this directory form: wrangler refuses
# "/admin/* /admin/index.html 200" as a redirect loop.
/admin/* /admin/ 200
```

- [ ] **Step 3: Create `public/_headers`**

```text
# Cloudflare Pages headers. QuickEval is a private tool: no page is indexed.
/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

# Vite puts a content hash in every file name under /assets/, so a changed
# file is always a new URL and can be cached for a year.
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- [ ] **Step 4: Create `public/robots.txt`**

```text
User-agent: *
Disallow: /
```

- [ ] **Step 5: Create `.dev.vars.example`**

```text
# Copy to .dev.vars (never committed). Local development only: the API accepts
# this email as the logged-in teacher, and only for requests to localhost.
DEV_TEACHER_EMAIL=profesor@example.com
```

- [ ] **Step 6: Create `scripts/seed-local.sql`**

```sql
-- The local development teacher. Matches DEV_TEACHER_EMAIL in .dev.vars.example.
INSERT OR IGNORE INTO teachers (email, name, created_at)
VALUES ('profesor@example.com', 'Laura Miron', '2026-10-06T08:00:00.000Z');
```

- [ ] **Step 7: Create `scripts/smoke.mjs`**

```js
// Smoke test against a running local server: `npm run preview` in one
// terminal, then `npm run smoke` in another. Checks the pages, the /admin
// rewrite, the security headers, and the classes API with the local login.
// Exits with code 1 on the first failure.

const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:8788';
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
}

async function page(path) {
  const res = await fetch(base + path, { redirect: 'manual' });
  return { res, text: await res.text() };
}

async function api(method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  return { status: res.status, body: await res.json() };
}

const landing = await page('/');
check('landing page', landing.res.status === 200 && landing.text.includes('Intră ca profesor'), String(landing.res.status));

for (const path of ['/admin/', '/admin/clase', '/admin/clase/123']) {
  const admin = await page(path);
  check(`teacher app at ${path}`, admin.res.status === 200 && admin.text.includes('<title>QuickEval · Profesor</title>'), String(admin.res.status));
}

const headers = (await page('/admin/')).res.headers;
check('noindex header', (headers.get('x-robots-tag') ?? '').includes('noindex'));
check('content security policy', (headers.get('content-security-policy') ?? '').includes("default-src 'self'"));

const me = await api('GET', '/api/admin/me');
check('local teacher login', me.status === 200 && typeof me.body.teacher?.email === 'string', JSON.stringify(me.body));

const name = `S${Date.now() % 100000}`;
const created = await api('POST', '/api/admin/classes', { name, schoolYear: 2026 });
check('create a class', created.status === 201 && created.body.class?.name === name, JSON.stringify(created.body));

const list = await api('GET', '/api/admin/classes?year=2026');
check('list classes', list.status === 200 && list.body.classes.some((c) => c.name === name), JSON.stringify(list.body));

const missing = await api('GET', '/api/nothing-here');
check('unknown API path is a JSON 404', missing.status === 404 && missing.body.error === 'not_found');

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
```

- [ ] **Step 8: Create `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "api",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev:api"],
      "port": 8788
    },
    {
      "name": "web",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev:web"],
      "port": 5173
    },
    {
      "name": "preview",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "preview"],
      "port": 8788
    }
  ]
}
```

- [ ] **Step 9: Make the local settings and the local database**

Run: `cp .dev.vars.example .dev.vars` (PowerShell: `Copy-Item .dev.vars.example .dev.vars`), then `npm run db:local`
Expected: wrangler lists `0001_people.sql` with status ✅ and `🚣 7 commands executed successfully`, then the seed command prints a JSON result with `"success": true`. In a terminal it may ask `continue? (y/n)`: answer `y`.

- [ ] **Step 10: Start the production build locally**

First make sure no old server holds the port: `netstat -ano | findstr :8788` must print nothing (see Step 15 if it does).

Run in a second terminal (or as a background job): `npm run preview`
Expected: the build finishes, then wrangler prints `✨ Parsed 1 valid redirect rule.`, `✨ Parsed 2 valid header rules.`, `env.DB (quickeval) D1 Database local`, and `Ready on http://127.0.0.1:8788`. If it prints `Infinite loop detected` for `_redirects`, the rule is not in the directory form of Step 2.

- [ ] **Step 11: Run the smoke test**

Run: `npm run smoke`
Expected: 10 lines starting with `PASS`, then `All smoke checks passed.`

- [ ] **Step 12: Check the teacher app in a browser**

Open http://127.0.0.1:8788/admin/clase in the Claude Code browser pane or in a browser.
Expected:
- The page shows "Clase 2026-2027" (the current school year), a class card for each class the smoke test made, and "QuickEval · Laura Miron" in the footer.
- The browser console shows no errors (in particular no Content-Security-Policy errors).
- Click a class. Paste two lines `1. Popescu Ana` and `2. Ștefan Ion`, then click "Adaugă 2 elevi". The list shows "Popescu Ana" and "Ștefan Ion", and the heading shows "Elevi (2 elevi)".
- The theme button switches between light (squared paper) and dark (chalkboard), and the choice stays after a reload.

Stop the preview server afterwards (Ctrl+C in its terminal; for a background job, see Step 15).

- [ ] **Step 13: Check the development setup**

Run `npm run dev:api` in one terminal and `npm run dev:web` in another. Open http://localhost:5173/admin/clase.
Expected: the page loads with hot reload. Add a class named `7e2`: the card "Clasa 7E2" appears. A refusal "Cererea vine de pe alt site și a fost refuzată." would mean the proxy in `vite.config.ts` lost `changeOrigin: false`. Stop both servers afterwards (Ctrl+C; for background jobs, see Step 15).

- [ ] **Step 14: Commit**

```bash
git add public scripts .dev.vars.example .claude/launch.json
git commit -m "Add the Pages routing and header files, local seed and smoke test"
```

- [ ] **Step 15: If a server will not stop (Windows)**

Stopping a background job on Windows can leave `wrangler` and `workerd.exe` running and still listening on port 8788 or 5173. The signs: `netstat -ano | findstr :8788` still prints `LISTENING` after you stopped the server, a new server starts but answers with old data, or requests hang. End the leftover processes in PowerShell, then check the ports again:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*\Projects\QuickEval\node_modules*' -or $_.CommandLine -like '*npm-cli.js*run preview*' -or $_.CommandLine -like '*npm-cli.js*run dev:*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
netstat -ano | findstr ":8788 :5173"
```

Expected: the second command prints no `LISTENING` line.

---

### Task 9: Project docs and CI

Agents and people get the project rules, and GitHub checks every push on Linux.

**Files:**
- Create: `AGENTS.md`, `CLAUDE.md`, `README.md`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the commands and rules of Tasks 1–8.
- Produces: the CI workflow `ci` that Task 10 waits for.

- [ ] **Step 1: Create `AGENTS.md`**

````markdown
# AGENTS.md

QuickEval: a web app that helps Laura Miron (math teacher, Liceul William Shakespeare, Timișoara) collect and grade her students' math tests. The teacher pages and the student pages are in Romanian. Code, comments, and docs are in English.

- Design: `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Plans: `docs/superpowers/plans/`
- Brand source: the "Matematică cu Laura Miron" site (`D:\Projects\Website`, https://lauramiron.pages.dev/)

## Structure

- `index.html`: the landing page. `admin/index.html`: the teacher app entry (React, served under `/admin/`).
- `src/ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian number words.
- `src/admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake.
- `src/test/`: test setup, the fake API (`fakeApi.ts`), `renderAdmin()`.
- `functions/api/[[route]].ts`: the Cloudflare Pages entry for `/api/*`. It serves the Hono app from `server/app.ts`.
- `server/`: the API. `routes/` (HTTP), `db/` (D1 queries), `auth/` (Cloudflare Access login), `http.ts` (JSON bodies, ids, same-origin writes), `errors.ts` (`ApiError`), `test/testApi.ts` (API test helper).
- `shared/`: code for both the API and the browser: zod request schemas and response types (`api.ts`), school year, class names, student names.
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
- `public/`: copied as-is into `dist/`: `_routes.json` (only `/api/*` runs Functions), `_redirects`, `_headers`, `theme.js`, `favicon.svg`, `robots.txt`.
- `scripts/`: `seed-local.sql` (the local teacher), `smoke.mjs` (checks a running local server).

## Commands

- `npm test`: all tests (Vitest projects "web" and "node").
- `npm run typecheck`: TypeScript, one strict config for everything.
- `npm run build`: typecheck, then the Vite build into `dist/`.
- `npm run db:local`: apply the migrations to the local D1 and add the local teacher.
- `npm run dev:api` and `npm run dev:web` (two terminals): develop with hot reload at http://localhost:5173/admin/.
- `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test.

## Rules

- All user-facing text is Romanian. The API reports errors as `{ error, message }`; the UI shows `message`.
- No page tells students that AI grades their work.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`.
- Times are stored as ISO 8601 UTC strings. School year Y runs from September of Y to August of Y+1, in Europe/Bucharest time.
- Functions do no heavy CPU work (10 ms of CPU per request on the free plan) and make at most 15 D1 queries per request. Group writes with `db.batch()`. Adding students uses a fixed number of queries, whatever the number of names.
- Relative imports name the `.ts` or `.tsx` file. TypeScript runs with `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties.
- Commits have no AI attribution lines. Code comments name no ticket or issue numbers.

## Gotchas

- npm blocks install scripts. After a fresh install, run `npm approve-scripts workerd esbuild`.
- `_redirects` must use `/admin/* /admin/ 200`. Wrangler refuses `/admin/* /admin/index.html 200` as a redirect loop.
- The Vite dev proxy keeps the Host header (`changeOrigin: false`). Otherwise the API refuses every write as cross-site.
- API tests use wrangler's `getPlatformProxy` (`server/test/testApi.ts`). Do not add `miniflare` as a direct dependency: its newest version changed its options format.
- Local login: `.dev.vars` sets `DEV_TEACHER_EMAIL`. The API accepts it only for requests to localhost or 127.0.0.1.
- Development happens on Windows. CI runs on Linux.
- On Windows, stopping a background `npm run preview` or `npm run dev:api` job can leave `workerd.exe` listening on its port. A new server then seems to start but answers with old data, or requests hang. Check with `netstat -ano | findstr :8788` and end the leftovers in PowerShell:

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*\Projects\QuickEval\node_modules*' -or $_.CommandLine -like '*npm-cli.js*run preview*' -or $_.CommandLine -like '*npm-cli.js*run dev:*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```

## Deploy

- Cloudflare Pages project `quickeval`, connected to the GitHub repo. Every push to `main` deploys. Build command `npm run build`, output `dist`, Node version from `.node-version`. Preview deployments are off: they would share the production database.
- `wrangler.toml` is the source of truth for bindings: D1 `DB` → database `quickeval`.
- Settings `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are Pages secrets: `npx wrangler pages secret put <NAME> --project-name quickeval`. A new secret applies from the next deployment.
- A new migration runs on the live database before the code that needs it: `npx wrangler d1 migrations apply quickeval --remote`.
- Cloudflare Access ("QuickEval admin") protects only `/admin` and `/api/admin`. Student pages (`/u`, `/api/u`) and the robot (`/api/runner`) must stay outside it.
- CI (`.github/workflows/ci.yml`) runs the typecheck, the tests, and the build on every push and pull request.
````

- [ ] **Step 2: Create `CLAUDE.md`**

```markdown
# CLAUDE.md

All project instructions are in `AGENTS.md`. Change instructions only there, so the two files never disagree.

@AGENTS.md

## Claude Code only

- Preview servers are in `.claude/launch.json`: `api` (port 8788) and `web` (port 5173) for development, `preview` (port 8788) for the production build.
```

- [ ] **Step 3: Create `README.md`**

```markdown
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
```

- [ ] **Step 4: Create `.github/workflows/ci.yml`**

```yaml
name: ci

# Typecheck, tests, and build on every push to main and every pull request.
# Development happens on Windows; this is where the Linux install is proven.

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 5: Run the same checks as CI**

Run: `npm run typecheck`, then `npm test`, then `npm run build`
Expected: all three exit with code 0; `Tests  86 passed (86)`.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md CLAUDE.md README.md .github
git commit -m "Add the project guide and the CI workflow"
```

---

### Task 10: Go live (main session only)

Each step that creates or changes something outside this PC needs the user's explicit yes in chat first. Ask with the exact name and the effect, for example: "I will create the public GitHub repo `parameciul/quickeval` and push. OK?" Steps marked **(user)** are clicks the user makes; give them the exact clicks and wait.

**Files:**
- Modify: `wrangler.toml` (real `database_id`), `AGENTS.md` (live URL line)

**Interfaces:**
- Consumes: the finished app and CI from Tasks 1–9.
- Produces: the live site, the D1 database `quickeval`, the Access application "QuickEval admin", the Pages secrets `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, and the first teacher row.

- [ ] **Step 1: Create the public GitHub repo and push (ask first)**

Ask the user to confirm the name `parameciul/quickeval` and that it is public (the GitHub robot of Plan 3 needs a public repo for free minutes). Then run:

```bash
gh repo create parameciul/quickeval --public --source . --remote origin --push
```

Expected: `✓ Created repository parameciul/quickeval on GitHub` and the push of branch `main`.

- [ ] **Step 2: Wait for CI on Linux**

Run: `gh run watch --exit-status` (pick the `ci` run for the last commit).
Expected: the job `test` passes (`npm ci`, typecheck, tests, build).
If `npm ci` fails on a missing native package (for example `@rolldown/binding-linux-x64-gnu`, `@cloudflare/workerd-linux-64`, `@esbuild/linux-x64`, or a TypeScript native package), the Windows lockfile lacks the Linux build. Fix it, then push again:

```bash
rm -rf node_modules package-lock.json
npm install
npm approve-scripts workerd esbuild
npm test
git add package.json package-lock.json
git commit -m "Regenerate the lockfile with all platform packages"
git push
```

Do not go on until CI is green.

- [ ] **Step 3: Log in to Cloudflare (user)**

Run: `npx wrangler login`
Expected: a browser window opens; the user approves; wrangler prints `Successfully logged in`. Use the same Cloudflare account as the Website (`lauramiron` Pages project).

- [ ] **Step 4: Create the D1 database (ask first)**

```bash
npx wrangler d1 create quickeval --location weur
```

Expected: wrangler prints a block with `"database_id": "<uuid>"`. In `wrangler.toml`, replace `00000000-0000-0000-0000-000000000000` with that uuid. Do not change anything else in the file.

- [ ] **Step 5: Apply the migration to the live database (ask first)**

Run: `npx wrangler d1 migrations apply quickeval --remote`
Expected: `0001_people.sql` with status ✅.

- [ ] **Step 6: Commit and push the real database id**

```bash
git add wrangler.toml
git commit -m "Use the live D1 database"
git push
```

Expected: CI passes again.

- [ ] **Step 7: Create the Pages project (user)**

Give the user these clicks:
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the GitHub account `parameciul` and the repo `quickeval`. If GitHub asks, allow Cloudflare to see this repo.
3. Project name: `quickeval`. Production branch: `main`.
4. Framework preset: **None**. Build command: `npm run build`. Build output directory: `dist`. Leave the root directory empty.
5. **Save and Deploy**, and wait for the first deployment to finish.
6. Project → **Settings** → **Builds** → **Branch control**: set preview deployments to **None**.

Ask the user for the address the dashboard shows. It is `https://quickeval.pages.dev` when the name was free; otherwise Cloudflare adds a suffix (for example `https://quickeval-4xy.pages.dev`). Use the real address in every later step and in `AGENTS.md`.

- [ ] **Step 8: Create the Access application (user)**

Give the user these clicks (Cloudflare **Zero Trust** dashboard, the same team as the Website admin):
1. **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application name: `QuickEval admin`.
3. Add a public hostname: domain `<project>.pages.dev` (from Step 7), path `admin`.
4. Add a second public hostname: the same domain, path `api/admin`.
5. Do not add any other path. `/u`, `/api/u`, and `/api/runner` must stay open for students and the robot.
6. Policy: name `Teachers`, action **Allow**, include **Emails** = the teacher's login email (and any other teacher email).
7. Save. Open the application and copy the **Application Audience (AUD) Tag**.
8. The team domain is under **Settings** → **Team name and domain** (for example `<team>.cloudflareaccess.com`). The Website's Pages settings use the same value as `ACCESS_TEAM_DOMAIN`.

- [ ] **Step 9: Set the Access secrets on Pages (ask first)**

```bash
npx wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name quickeval
npx wrangler pages secret put ACCESS_AUD --project-name quickeval
```

Each command asks for the value; paste the team domain and the AUD tag from Step 8. Then start a new deployment: an empty commit (`git commit --allow-empty -m "Redeploy with the Access settings"` and `git push`) or **Retry deployment** in the dashboard. Secrets apply only to new deployments.

- [ ] **Step 10: Add the first teacher (ask first)**

Ask the user for the email the teacher uses for the Access login. Then run (replace the email):

```bash
npx wrangler d1 execute quickeval --remote --command "INSERT INTO teachers (email, name, created_at) VALUES (lower('<teacher email>'), 'Laura Miron', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
```

Expected: `"success": true` and `changes: 1`. `lower(...)` stores the email in lowercase; the database refuses an email with capital letters.

- [ ] **Step 11: Check the live site with the user**

Each check needs the user's browser (the Access login). Ask the user to do them and to report what they see:
1. **Logged out**: in a private window, open `https://<host>/api/admin/me`. It must show the Access login page or an error, never `{"teacher": …}`.
2. **Login**: open `https://<host>/admin/`. Access asks for the email and sends a code. After the code, the classes page shows "Clase 2026-2027" and the footer "QuickEval · Laura Miron".
3. **Deep link**: open `https://<host>/admin/clase` directly and reload. It must show the teacher app, not the landing page.
4. **Classes**: create `6E2`, `7E2`, `8E2`, `9R2`, and `11R1` for 2026-2027.
5. **Many students**: in one class, paste 30 names at once. All 30 must appear. If the API answers with an error about too many queries or a 500, report it: the design keeps one request at a fixed number of queries (§5 of the spec), so any such error is a bug to fix before Plan 2.
6. **Landing page**: `https://<host>/` shows "Intră ca profesor" and nothing about AI.

- [ ] **Step 12: Record the live URL and push**

In `AGENTS.md`, below the line that starts with `- Plans:`, add the line `- Live: https://<host>/` with the real address. Then:

```bash
git add AGENTS.md
git commit -m "Note the live address"
git push
```

Expected: CI passes and Pages deploys the commit.

---

## Self-review notes

- Spec §19, Plan 1 scope: repo scaffold (Tasks 1–2, 6, 8), brand shell (Task 6), Access login + `/me` + expired-login reload (Tasks 3 and 6), classes and students API and UI with the school-year switch and paste-many (Tasks 4–7), CI (Task 9), deployment (Task 10).
- Not in Plan 1, by design: R2 (Plan 2 creates the bucket when uploads need it), tests, uploads, the robot, reports, the student history page (Plan 4).
- Every code block was run before this plan was written: typecheck with TypeScript 7.0.2, 86 tests in 15 files with Vitest 5.0.3, the Vite 8 build, `wrangler pages dev` with the smoke test, and a browser check in light and dark themes.
