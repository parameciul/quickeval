import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fastD1 } from './fastD1.ts';
import { fastR2 } from './fastR2.ts';
import { applyMigrations, workerdPlatform } from './testApi.ts';

// The server tests run on fastD1 (node:sqlite). This file runs the same checks
// on the local workerd D1 and on fastD1, so a difference between the two
// engines fails here. It runs in the "d1" project, which starts workerd.

type Engine = { name: string; db: D1Database; files: R2Bucket; close: () => Promise<void> };

const engines: Engine[] = [];

beforeAll(async () => {
  const platform = await workerdPlatform();
  engines.push({ name: 'workerd', db: platform.env.DB, files: platform.env.FILES, close: () => platform.dispose() });
  engines.push({ name: 'fast', db: fastD1(), files: fastR2(), close: async () => {} });
}, 60000);

afterAll(async () => {
  for (const engine of engines) await engine.close();
});

const tableList = async (db: D1Database) =>
  (await db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') ORDER BY name").all<{ name: string }>()).results
    .map((row) => row.name)
    .filter((name) => !name.startsWith('sqlite_') && !name.startsWith('_cf_') && name !== 'd1_migrations');

describe('both engines', () => {
  it('apply every migration and make the same tables, indexes and triggers', async () => {
    const lists: string[][] = [];
    for (const { db } of engines) {
      await applyMigrations(db);
      lists.push(await tableList(db));
    }
    expect(lists[0]!.length).toBeGreaterThan(0);
    expect(lists[1]).toEqual(lists[0]);
  });

  it.each(['workerd', 'fast'])('%s: rolls back a batch whose statement fails', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    await db.exec('CREATE TABLE IF NOT EXISTS p_batch (id INTEGER PRIMARY KEY, v TEXT UNIQUE)');
    const insert = (v: string) => db.prepare('INSERT INTO p_batch (v) VALUES (?)').bind(v);
    await expect(db.batch([insert('a'), insert('b'), insert('a')])).rejects.toThrow(/UNIQUE constraint failed/);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM p_batch').first('n')).toBe(0);
  });

  it.each(['workerd', 'fast'])('%s: binds true, false, whole numbers and fractions the same way', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    const row = await db
      .prepare('SELECT typeof(?) AS a, ? AS b, typeof(?) AS c, typeof(?) AS d, typeof(?) AS e')
      .bind(true, false, 7, 1.5, 'x')
      .first();
    expect(row).toEqual({ a: 'real', b: 0, c: 'real', d: 'real', e: 'text' });
  });

  it.each(['workerd', 'fast'])('%s: stores a bound number the same way in TEXT and INTEGER columns', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    await db.exec('CREATE TABLE IF NOT EXISTS p_types (id INTEGER PRIMARY KEY, t TEXT, i INTEGER)');
    await db.prepare('INSERT INTO p_types (id, t, i) VALUES (?, ?, ?)').bind(7, 7, true).run();
    const row = await db.prepare('SELECT typeof(id) AS a, id, typeof(t) AS b, t, typeof(i) AS c, i FROM p_types').first();
    expect(row).toEqual({ a: 'integer', id: 7, b: 'text', t: '7.0', c: 'integer', i: 1 });
  });

  it.each(['workerd', 'fast'])('%s: refuses undefined when it is bound', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    expect(() => db.prepare('SELECT ?').bind(undefined)).toThrow(/D1_TYPE_ERROR/);
  });

  it.each(['workerd', 'fast'])('%s: gives a blob as an array of numbers', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    expect(await db.prepare('SELECT ? AS b').bind(new Uint8Array([1, 2])).first('b')).toEqual([1, 2]);
  });

  it.each(['workerd', 'fast'])('%s: fills changes and last_row_id', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    await db.exec('CREATE TABLE IF NOT EXISTS p_meta (id INTEGER PRIMARY KEY, v TEXT)');
    const inserted = await db.prepare('INSERT INTO p_meta (v) VALUES (?)').bind('a').run();
    await db.prepare('INSERT INTO p_meta (v) VALUES (?)').bind('b').run();
    const id = await db.prepare("SELECT id FROM p_meta WHERE v = 'a'").first('id');
    expect(inserted.meta.last_row_id).toBe(id);
    expect((await db.prepare('UPDATE p_meta SET v = v').run()).meta.changes).toBe(2);
  });

  it.each(['workerd', 'fast'])('%s: counts the rows triggers change in meta.changes, and none for a SELECT', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    await db.exec('CREATE TABLE IF NOT EXISTS p_src (id INTEGER PRIMARY KEY, v TEXT)');
    await db.exec('CREATE TABLE IF NOT EXISTS p_log (id INTEGER PRIMARY KEY, v TEXT)');
    await db.exec('CREATE TRIGGER IF NOT EXISTS p_src_log AFTER INSERT ON p_src BEGIN INSERT INTO p_log (v) VALUES (NEW.v); INSERT INTO p_log (v) VALUES (NEW.v); END');
    expect((await db.prepare('INSERT INTO p_src (v) VALUES (?)').bind('a').run()).meta.changes).toBe(3);
    expect((await db.prepare('INSERT INTO p_src (v) VALUES (?) RETURNING id').bind('b').run()).meta.changes).toBe(3);
    expect((await db.prepare('SELECT * FROM p_src').run()).meta.changes).toBe(0);
  });

  it.each(['workerd', 'fast'])('%s: sees a new column in a SELECT * it ran before', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    await db.exec('CREATE TABLE IF NOT EXISTS p_alter (n INTEGER)');
    await db.prepare('INSERT INTO p_alter (n) VALUES (1)').run();
    expect(await db.prepare('SELECT * FROM p_alter').first()).toEqual({ n: 1 });
    await db.prepare('ALTER TABLE p_alter ADD COLUMN extra TEXT').run();
    expect(await db.prepare('SELECT * FROM p_alter').first()).toEqual({ n: 1, extra: null });
  });

  it.each(['workerd', 'fast'])('%s: refuses an empty batch and a bigint', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    await expect(db.batch([])).rejects.toThrow(/No SQL statements detected/);
    expect(() => db.prepare('SELECT ?').bind(1n)).toThrow(/D1_TYPE_ERROR/);
  });

  it.each(['workerd', 'fast'])('%s: enforces foreign keys', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    await db.exec('CREATE TABLE IF NOT EXISTS p_parent (id INTEGER PRIMARY KEY)');
    await db.exec('CREATE TABLE IF NOT EXISTS p_child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES p_parent(id))');
    await expect(db.prepare('INSERT INTO p_child (parent_id) VALUES (?)').bind(99).run()).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it.each(['workerd', 'fast'])('%s: gives null for first() with no row, and throws for a missing column', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    expect(await db.prepare('SELECT 1 AS x WHERE 0').first()).toBeNull();
    await expect(db.prepare('SELECT 1 AS x').first('nope')).rejects.toThrow(/D1_COLUMN_NOTFOUND/);
  });

  it.each(['workerd', 'fast'])('%s: reports an SQL error as a D1 error', async (name) => {
    const { db } = engines.find((e) => e.name === name)!;
    await expect(db.prepare('SELECT * FROM missing_table').all()).rejects.toThrow(/D1_ERROR.*no such table/);
  });
});

describe('both buckets', () => {
  it.each(['workerd', 'fast'])('%s: refuses a stream of unknown length', async (name) => {
    const { files } = engines.find((e) => e.name === name)!;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    await expect(files.put('stream', stream as never)).rejects.toThrow(/known length/);
  });

});
