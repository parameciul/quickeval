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
