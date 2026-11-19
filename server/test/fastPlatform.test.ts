import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it } from 'vitest';
import { fastD1 } from './fastD1.ts';
import { fastR2 } from './fastR2.ts';

describe('fastD1', () => {
  let db: D1Database;

  beforeEach(async () => {
    db = fastD1();
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT UNIQUE, b BLOB)');
  });

  it('rolls back a batch whose statement fails', async () => {
    const insert = (v: string) => db.prepare('INSERT INTO t (v) VALUES (?)').bind(v);
    await expect(db.batch([insert('a'), insert('b'), insert('a')])).rejects.toThrow(/UNIQUE constraint failed/);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM t').first('n')).toBe(0);
  });

  it('commits a batch whose statements all work', async () => {
    const insert = (v: string) => db.prepare('INSERT INTO t (v) VALUES (?)').bind(v);
    const results = await db.batch([insert('a'), insert('b')]);
    expect(results).toHaveLength(2);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM t').first('n')).toBe(2);
  });

  it('binds true and false as 1 and 0, as REAL like D1', async () => {
    expect(await db.prepare('SELECT typeof(?) AS t, ? AS v').bind(true, true).first()).toEqual({ t: 'real', v: 1 });
    expect(await db.prepare('SELECT typeof(?) AS t, ? AS v').bind(false, false).first()).toEqual({ t: 'real', v: 0 });
  });

  it('binds every number as REAL like D1, and an INTEGER column keeps a whole number', async () => {
    expect(await db.prepare('SELECT typeof(?) AS t').bind(7).first('t')).toBe('real');
    await db.prepare('INSERT INTO t (id, v) VALUES (?, ?)').bind(7, 7).run();
    expect(await db.prepare('SELECT typeof(id) AS t, id FROM t').first()).toEqual({ t: 'integer', id: 7 });
  });

  it('refuses undefined when it is bound', () => {
    expect(() => db.prepare('INSERT INTO t (v) VALUES (?)').bind(undefined)).toThrow(/D1_TYPE_ERROR/);
  });

  it('gives a blob as an array of numbers', async () => {
    await db.prepare('INSERT INTO t (v, b) VALUES (?, ?)').bind('x', new Uint8Array([1, 2])).run();
    expect(await db.prepare('SELECT b FROM t').first('b')).toEqual([1, 2]);
  });

  it('fills changes and last_row_id', async () => {
    const first = await db.prepare('INSERT INTO t (v) VALUES (?)').bind('a').run();
    await db.prepare('INSERT INTO t (v) VALUES (?)').bind('b').run();
    const id = await db.prepare("SELECT id FROM t WHERE v = 'a'").first('id');
    expect(first.meta.last_row_id).toBe(id);
    const updated = await db.prepare('UPDATE t SET v = v').run();
    expect(updated.meta.changes).toBe(2);
  });

  it('returns the rows of a RETURNING statement', async () => {
    const row = await db.prepare('INSERT INTO t (v) VALUES (?) RETURNING id, v').bind('a').first<{ id: number; v: string }>();
    expect(row).toEqual({ id: expect.any(Number), v: 'a' });
  });

  it('enforces foreign keys', async () => {
    await db.exec('CREATE TABLE child (id INTEGER PRIMARY KEY, t_id INTEGER NOT NULL REFERENCES t(id))');
    await expect(db.prepare('INSERT INTO child (t_id) VALUES (?)').bind(99).run()).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it('reports no rows_read, so a test that counts rows fails on it', async () => {
    const result = await db.prepare('SELECT * FROM t').run();
    expect(Number.isNaN(result.meta.rows_read)).toBe(true);
  });

  it('gives null for first() with no row, and throws for a missing column', async () => {
    expect(await db.prepare('SELECT * FROM t').first()).toBeNull();
    await db.prepare('INSERT INTO t (v) VALUES (?)').bind('a').run();
    await expect(db.prepare('SELECT v FROM t').first('nope')).rejects.toThrow(/D1_COLUMN_NOTFOUND/);
  });

  it('gives rows as arrays with raw()', async () => {
    await db.prepare('INSERT INTO t (id, v) VALUES (1, ?)').bind('a').run();
    expect(await db.prepare('SELECT id, v FROM t').raw()).toEqual([[1, 'a']]);
    expect(await db.prepare('SELECT id, v FROM t').raw({ columnNames: true })).toEqual([['id', 'v'], [1, 'a']]);
  });

  it('reports an SQL error as a D1 error', async () => {
    await expect(db.prepare('SELECT * FROM missing').all()).rejects.toThrow(/D1_ERROR.*no such table/);
  });
});

describe('fastR2', () => {
  let bucket: R2Bucket;

  beforeEach(() => {
    bucket = fastR2();
  });

  it('keeps the bytes and the content type', async () => {
    await bucket.put('k', new Uint8Array([1, 2]), { httpMetadata: { contentType: 'image/jpeg' } });
    const object = await bucket.get('k');
    expect(object!.size).toBe(2);
    expect(object!.httpMetadata!.contentType).toBe('image/jpeg');
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
    expect(new Uint8Array(await new Response(object!.body as unknown as ReadableStream).arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  it('keeps a copy, not the caller’s array', async () => {
    const bytes = new Uint8Array([1]);
    await bucket.put('k', bytes);
    bytes[0] = 9;
    expect(new Uint8Array(await (await bucket.get('k'))!.arrayBuffer())).toEqual(new Uint8Array([1]));
  });

  it('stores text and gives it back', async () => {
    await bucket.put('t', 'ok');
    expect(await (await bucket.get('t'))!.text()).toBe('ok');
  });

  it('gives null for a missing key, on get and head', async () => {
    expect(await bucket.get('nope')).toBeNull();
    expect(await bucket.head('nope')).toBeNull();
  });

  it('lists by prefix in key order and deletes many keys', async () => {
    for (const key of ['b/2', 'a/1', 'b/1']) await bucket.put(key, 'x');
    expect((await bucket.list({ prefix: 'b/' })).objects.map((o) => o.key)).toEqual(['b/1', 'b/2']);
    await bucket.delete(['b/1', 'b/2']);
    await bucket.delete('a/1');
    expect((await bucket.list()).objects).toEqual([]);
  });

  // Production R2 takes at most 1000 keys per delete; the local engine takes
  // more. The fake follows production, so a test catches a delete too big.
  it('refuses a delete of more than 1000 keys', async () => {
    await expect(bucket.delete(Array.from({ length: 1001 }, (_, index) => `k${index}`))).rejects.toThrow(/1000/);
  });
});
