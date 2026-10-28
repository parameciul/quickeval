import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { D1Database } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { splitSql } from './test/testApi.ts';

// Migration 0015 on a database that already has teachers and tests, as the
// live one does.

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);
let dispose: (() => Promise<void>) | undefined;

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

async function databaseBefore0015(): Promise<{ db: D1Database; apply0015: () => Promise<void> }> {
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('../wrangler.toml', import.meta.url)),
    persist: false,
    remoteBindings: false,
  });
  dispose = () => platform.dispose();
  const db = platform.env.DB;
  const files = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
  const run = async (file: string) => {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
    await db.batch(splitSql(sql).map((statement) => db.prepare(statement)));
  };
  for (const file of files.filter((name) => name < '0015')) await run(file);
  return { db, apply0015: () => run(files.find((name) => name.startsWith('0015'))!) };
}

const addTeacher = (db: D1Database, email: string) =>
  db.prepare("INSERT INTO teachers (email, name, created_at) VALUES (?, 'X', '2026-10-06')").bind(email).run();
const rolesOf = async (db: D1Database) =>
  (await db.prepare('SELECT email, role, status, demo FROM teachers ORDER BY id').all()).results;

describe('migration 0015', () => {
  it('makes the two administrators, and keeps every teacher active and complete', async () => {
    const { db, apply0015 } = await databaseBefore0015();
    await addTeacher(db, 'plesalaura@yahoo.com');
    await addTeacher(db, 'alt@example.com');
    await addTeacher(db, 'mg1497_miron@yahoo.com');
    await apply0015();
    expect(await rolesOf(db)).toEqual([
      { email: 'plesalaura@yahoo.com', role: 'admin', status: 'active', demo: 0 },
      { email: 'alt@example.com', role: 'teacher', status: 'active', demo: 0 },
      { email: 'mg1497_miron@yahoo.com', role: 'admin', status: 'active', demo: 0 },
    ]);
  });

  it('keeps the first teacher an administrator when neither email has a row', async () => {
    const { db, apply0015 } = await databaseBefore0015();
    await addTeacher(db, 'laura@example.com');
    await addTeacher(db, 'alt@example.com');
    await apply0015();
    expect((await rolesOf(db)).map((row) => row.role)).toEqual(['admin', 'teacher']);
  });

  it('counts the tests already evaluated, also those reopened since', async () => {
    const { db, apply0015 } = await databaseBefore0015();
    await addTeacher(db, 'plesalaura@yahoo.com');
    await db.prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (1, '6E2', 2026, '2026-10-06')").run();
    const test = (number: number, status: string, started: string | null) =>
      db
        .prepare(
          `INSERT INTO tests (teacher_id, class_id, number, code, title, status, evaluation_started_at, created_at, updated_at)
           VALUES (1, 1, ?, ?, 'T', ?, ?, '2026-10-06', '2026-10-06')`,
        )
        .bind(number, `6E2-26T${number}`, status, started)
        .run();
    await test(1, 'done', '2026-10-07');
    await test(2, 'open', '2026-10-07');
    await test(3, 'open', null);
    await apply0015();
    const counted = await db.prepare('SELECT number, evaluation_counted FROM tests ORDER BY number').all();
    expect(counted.results).toEqual([
      { number: 1, evaluation_counted: 1 },
      { number: 2, evaluation_counted: 1 },
      { number: 3, evaluation_counted: 0 },
    ]);
  });
});
