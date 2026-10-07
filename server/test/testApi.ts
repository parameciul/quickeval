import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { D1Database } from '@cloudflare/workers-types';
import { getPlatformProxy } from 'wrangler';
import { createApp } from '../app.ts';
import type { Env } from '../env.ts';

// API tests run the real Hono app in Node against the local D1 and R2 engines
// that `wrangler pages dev` also uses. getPlatformProxy reads the bindings from
// wrangler.toml. With persist: false, every startTestApi() call gets a new,
// empty, in-memory database and file bucket; the migrations are applied here.

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
  const platform = await getPlatformProxy<Pick<Env, 'DB' | 'FILES'>>({
    configPath: WRANGLER_CONFIG,
    persist: false,
    remoteBindings: false,
  });
  const db = platform.env.DB;

  const addTeacher = async (email: string, name: string) => {
    const row = await db
      .prepare('INSERT INTO teachers (email, name, created_at) VALUES (?, ?, ?) RETURNING id')
      .bind(email, name, '2026-10-06T08:00:00.000Z')
      .first<{ id: number }>();
    return row!.id;
  };

  let teacherId: number;
  try {
    await applyMigrations(db);
    teacherId = await addTeacher(TEACHER_EMAIL, 'Laura Miron');
  } catch (err) {
    // A failed setup must not leave the local engine running.
    await platform.dispose();
    throw err;
  }

  const env: Env = { DB: db, FILES: platform.env.FILES, DEV_TEACHER_EMAIL: TEACHER_EMAIL, ...options.env };
  const app = createApp();
  const send = (path: string, init: RequestInit = {}) => Promise.resolve(app.request(`http://localhost${path}`, init, env));

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
      return { status: res.status, headers: res.headers, body: text === '' ? null : JSON.parse(text) };
    },
    fetch: send,
    dispose: () => platform.dispose(),
  };
}
