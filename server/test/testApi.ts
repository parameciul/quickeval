import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { createApp } from '../app.ts';
import type { AppOptions, Env } from '../env.ts';

// API tests run the real Hono app in Node against the local D1 and R2 engines
// that `wrangler pages dev` also uses. getPlatformProxy reads the bindings from
// wrangler.toml. With persist: false the database and the file bucket live in
// memory only. Starting the local engine costs about half a second, so a test
// file starts it once (at its first startTestApi()) and closes it after its last
// test. Every startTestApi() call still sees a database and a bucket in the
// state of a new one: the migrations are applied once, and dispose() empties
// all tables and the bucket.

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
const WRANGLER_CONFIG = fileURLToPath(new URL('../../wrangler.toml', import.meta.url));

export const TEACHER_EMAIL = 'profesor@example.com';

export interface TestResponse {
  status: number;
  headers: Headers;
  // The parsed JSON body, or null for an empty body. Tests read fields from it directly.
  body: any;
}

export interface TestApi {
  env: Env;
  db: D1Database;
  teacherId: number;
  // A JSON request to the API. A body is sent as JSON unless the headers name another type.
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse>;
  // The raw response, for requests whose body or answer is not JSON.
  fetch(path: string, init?: RequestInit): Promise<Response>;
  // An active teacher account (not an administrator, not demo) unless `options` say otherwise.
  addTeacher(email: string, name: string, options?: { role?: 'admin' | 'teacher'; demo?: boolean }): Promise<number>;
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

type Platform = Awaited<ReturnType<typeof getPlatformProxy<Pick<Env, 'DB' | 'FILES'>>>>;

let shared: Promise<Platform> | undefined;
// Tests of one file run one after the other, so one engine is never used by two tests.
let migrated = false;

async function platformOfFile(): Promise<Platform> {
  shared ??= getPlatformProxy<Pick<Env, 'DB' | 'FILES'>>({
    configPath: WRANGLER_CONFIG,
    persist: false,
    remoteBindings: false,
  });
  return shared;
}

afterAll(async () => {
  const platform = await shared?.catch(() => undefined);
  shared = undefined;
  migrated = false;
  await platform?.dispose();
});

// The rows the migrations leave behind (runner_state has one), by table.
let seed: { table: string; rows: Record<string, unknown>[] }[] = [];

async function tablesOf(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
  return results.map((row) => row.name).filter((name) => !name.startsWith('sqlite_') && !name.startsWith('_cf_') && name !== 'd1_migrations');
}

async function saveSeed(db: D1Database): Promise<void> {
  seed = [];
  for (const table of await tablesOf(db)) {
    const { results } = await db.prepare(`SELECT * FROM "${table}"`).all<Record<string, unknown>>();
    if (results.length > 0) seed.push({ table, rows: results });
  }
}

// Brings every table back to the state the migrations left, and empties the bucket.
async function resetState(db: D1Database, files: R2Bucket): Promise<void> {
  const inserts = seed.flatMap(({ table, rows }) =>
    rows.map((row) => {
      const columns = Object.keys(row);
      return db
        .prepare(`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
        .bind(...columns.map((c) => row[c]));
    }),
  );
  await db.batch([
    db.prepare('PRAGMA defer_foreign_keys = on'),
    ...(await tablesOf(db)).map((name) => db.prepare(`DELETE FROM "${name}"`)),
    ...inserts,
  ]);
  let cursor: string | undefined;
  do {
    const listed = await files.list({ cursor });
    if (listed.objects.length > 0) await files.delete(listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

export async function startTestApi(options: { env?: Partial<Env>; app?: AppOptions } = {}): Promise<TestApi> {
  const platform = await platformOfFile();
  const db = platform.env.DB;
  const bucket = platform.env.FILES;

  const addTeacher = async (email: string, name: string, options: { role?: 'admin' | 'teacher'; demo?: boolean } = {}) => {
    const row = await db
      .prepare('INSERT INTO teachers (email, name, created_at, email_confirmed_at, role, demo) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(email, name, '2026-10-06T08:00:00.000Z', '2026-10-06T08:00:00.000Z', options.role ?? 'teacher', options.demo ? 1 : 0)
      .first<{ id: number }>();
    return row!.id;
  };

  let teacherId: number;
  try {
    if (migrated) await resetState(db, bucket);
    else {
      await applyMigrations(db);
      await saveSeed(db);
      migrated = true;
    }
    // The teacher of the tests is an administrator, as Laura is.
    teacherId = await addTeacher(TEACHER_EMAIL, 'Laura Miron', { role: 'admin' });
  } catch (err) {
    // The state is unknown: the next call starts the engine again.
    shared = undefined;
    migrated = false;
    await platform.dispose();
    throw err;
  }

  const env: Env = { DB: db, FILES: bucket, DEV_TEACHER_EMAIL: TEACHER_EMAIL, ...options.env };
  const app = createApp(options.app);
  // Work a route leaves running after its answer (inBackground): request()
  // waits for it, so a test sees the emails; fetch() does not.
  const background: Promise<unknown>[] = [];
  const executionCtx = { waitUntil: (work: Promise<unknown>) => void background.push(work), passThroughOnException: () => {}, props: {} };
  const send = (path: string, init: RequestInit = {}) => Promise.resolve(app.request(`http://localhost${path}`, init, env, executionCtx));

  return {
    env,
    db,
    teacherId,
    addTeacher,
    async request(method, path, body, headers = {}) {
      const merged = new Headers(headers);
      const init: RequestInit = { method, headers: merged };
      if (body !== undefined) {
        if (!merged.has('Content-Type')) merged.set('Content-Type', 'application/json');
        init.body = JSON.stringify(body);
      }
      const res = await send(path, init);
      const text = await res.text();
      await Promise.all(background.splice(0));
      return { status: res.status, headers: res.headers, body: text === '' ? null : JSON.parse(text) };
    },
    fetch: send,
    // The engine stays for the next test of the file; the next start empties it.
    // Work a route left running (fetch() does not wait for it) ends here, so it
    // cannot write into the database of the next test.
    dispose: async () => {
      await Promise.allSettled(background.splice(0));
    },
  };
}
