import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, isUniqueViolation } from './errors.ts';
import { parseId, readJson, sameOriginWrites } from './http.ts';

// A small app that answers ApiErrors the way server/app.ts does.
function testApp() {
  const app = new Hono();
  app.onError((err, c) =>
    err instanceof ApiError ? c.json({ error: err.code, message: err.message }, err.status) : c.json({ error: 'internal' }, 500),
  );
  app.use('*', sameOriginWrites);
  app.post('/echo', async (c) => c.json(await readJson(c, z.object({ name: z.string().min(1, { message: 'Numele lipsește.' }) }))));
  app.get('/item/:id', (c) => c.json({ id: parseId(c.req.param('id')) }));
  return app;
}

const post = (body: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  testApp().request('http://localhost/echo', { method: 'POST', body, headers });

describe('readJson', () => {
  it('returns the parsed body', async () => {
    const res = await post(JSON.stringify({ name: 'Ana' }));
    expect(await res.json()).toEqual({ name: 'Ana' });
  });

  it('accepts a JSON content type with a charset', async () => {
    const res = await post(JSON.stringify({ name: 'Ana' }), { 'Content-Type': 'application/json; charset=utf-8' });
    expect(res.status).toBe(200);
  });

  it('refuses another content type with 415', async () => {
    const res = await post(JSON.stringify({ name: 'Ana' }), { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'bad_content_type', message: 'Cererea trebuie trimisă ca JSON.' });
  });

  it('refuses broken JSON with 400', async () => {
    const res = await post('{"name": ');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_json');
  });

  it('reports the first schema problem in Romanian', async () => {
    const res = await post(JSON.stringify({ name: '' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid', message: 'Numele lipsește.' });
  });
});

describe('parseId', () => {
  it('passes a positive integer and answers 404 for anything else', async () => {
    expect(await (await testApp().request('http://localhost/item/42')).json()).toEqual({ id: 42 });
    for (const raw of ['0', '1e3', '0x10', '-1', '07']) {
      expect((await testApp().request(`http://localhost/item/${raw}`)).status).toBe(404);
    }
  });
});

describe('sameOriginWrites', () => {
  it('lets reads through from any site', async () => {
    const res = await testApp().request('http://localhost/item/1', { headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' } });
    expect(res.status).toBe(200);
  });

  it('accepts a write from the same origin', async () => {
    const res = await post(JSON.stringify({ name: 'Ana' }), {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
      'Sec-Fetch-Site': 'same-origin',
    });
    expect(res.status).toBe(200);
  });

  it('refuses a write from another origin or marked by the browser as another site', async () => {
    const refused: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': 'cross-site' }];
    for (const headers of refused) {
      const res = await post(JSON.stringify({ name: 'Ana' }), { 'Content-Type': 'application/json', ...headers });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('cross_site');
    }
  });
});

describe('isUniqueViolation', () => {
  it('recognizes the SQLite unique error in an Error or a string', () => {
    expect(isUniqueViolation(new Error('D1_ERROR: UNIQUE constraint failed: classes.teacher_id'))).toBe(true);
    expect(isUniqueViolation('UNIQUE constraint failed: tests.code')).toBe(true);
    expect(isUniqueViolation(new Error('FOREIGN KEY constraint failed'))).toBe(false);
  });
});
