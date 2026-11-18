import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { D1Database } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { splitSql } from './test/testApi.ts';

// Migration 0035 on a database that already has robot work and Quick Tries,
// as the live one does.

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);
let dispose: (() => Promise<void>) | undefined;

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

async function databaseBefore0035(): Promise<{ db: D1Database; apply0035: () => Promise<void> }> {
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
  for (const file of files.filter((name) => name < '0035')) await run(file);
  return { db, apply0035: () => run(files.find((name) => name.startsWith('0035'))!) };
}

describe('migration 0035', () => {
  it('fills the past days from the robot log and the tries that still exist', async () => {
    const { db, apply0035 } = await databaseBefore0035();
    const teacher = (email: string, quickTry: number) =>
      db
        .prepare("INSERT INTO teachers (email, name, created_at, quick_try) VALUES (?, 'X', '2026-11-14T08:00:00.000Z', ?) RETURNING id")
        .bind(email, quickTry)
        .first<{ id: number }>();
    const laura = (await teacher('laura@example.com', 0))!.id;
    const guest1 = (await teacher('guest1@example.com', 1))!.id;
    const guest2 = (await teacher('guest2@example.com', 1))!.id;
    const work = (teacherId: number, kind: string, ok: number, tokens: number | null, at: string) =>
      db
        .prepare('INSERT INTO robot_work (teacher_id, test_id, kind, variant, ok, tokens, at) VALUES (?, NULL, ?, ?, ?, ?, ?)')
        .bind(teacherId, kind, 'class', ok, tokens, at)
        .run();
    await work(laura, 'grading', 1, 100, '2026-11-14T10:00:00.000Z');
    await work(laura, 'grading', 1, 50, '2026-11-14T21:59:00.000Z');
    await work(laura, 'grading', 0, null, '2026-11-14T22:30:00.000Z');
    await work(laura, 'print', 1, null, '2026-11-14T22:30:00.000Z');
    await work(laura, 'analysis', 1, 40, '2026-11-15T09:00:00.000Z');
    await work(guest1, 'barem', 1, 7, '2026-11-15T09:00:00.000Z');
    await work(guest2, 'grading', 1, 3, '2026-11-15T10:00:00.000Z');
    const tryRow = (teacherId: number, token: string, day: string) =>
      db
        .prepare("INSERT INTO quick_tries (teacher_id, token_hash, day, ip_hash, created_at, expires_at) VALUES (?, ?, ?, 'ip', '2026-11-15T08:00:00.000Z', '2026-11-22T08:00:00.000Z')")
        .bind(teacherId, token, day)
        .run();
    await tryRow(guest1, 'a', '2026-11-15');
    await tryRow(guest2, 'b', '2026-11-15');

    await apply0035();

    const rows = await db
      .prepare('SELECT day, quick_try, teacher_id, papers, barems, exercise_lists, analyses, prints, failed, tokens, tries FROM usage_days ORDER BY day, quick_try, teacher_id')
      .all();
    expect(rows.results).toEqual([
      { day: '2026-11-14', quick_try: 0, teacher_id: laura, papers: 2, barems: 0, exercise_lists: 0, analyses: 0, prints: 0, failed: 0, tokens: 150, tries: 0 },
      { day: '2026-11-15', quick_try: 0, teacher_id: laura, papers: 0, barems: 0, exercise_lists: 0, analyses: 1, prints: 1, failed: 1, tokens: 40, tries: 0 },
      { day: '2026-11-15', quick_try: 1, teacher_id: 0, papers: 1, barems: 1, exercise_lists: 0, analyses: 0, prints: 0, failed: 0, tokens: 10, tries: 2 },
    ]);
  });

  it('makes a Quick Try row for a day with tries and no robot work', async () => {
    const { db, apply0035 } = await databaseBefore0035();
    const guest = await db
      .prepare("INSERT INTO teachers (email, name, created_at, quick_try) VALUES ('g@example.com', 'X', '2026-11-16T08:00:00.000Z', 1) RETURNING id")
      .first<{ id: number }>();
    await db
      .prepare("INSERT INTO quick_tries (teacher_id, token_hash, day, ip_hash, created_at, expires_at) VALUES (?, 'a', '2026-11-16', 'ip', '2026-11-16T08:00:00.000Z', '2026-11-23T08:00:00.000Z')")
      .bind(guest!.id)
      .run();
    await apply0035();
    const rows = await db.prepare('SELECT day, quick_try, teacher_id, papers, tries FROM usage_days').all();
    expect(rows.results).toEqual([{ day: '2026-11-16', quick_try: 1, teacher_id: 0, papers: 0, tries: 1 }]);
  });
});
