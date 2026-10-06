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
