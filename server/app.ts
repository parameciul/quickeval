import { Hono } from 'hono';
import type { AppEnv, AppOptions } from './env.ts';
import { ApiError } from './errors.ts';
import { adminRoutes } from './routes/admin.ts';
import { uploadRoutes } from './routes/upload.ts';

// The whole API. functions/api/[[route]].ts serves it on Cloudflare Pages.
export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');

  // public/_headers does not reach Function responses, so the API sets its own:
  // browsers must not guess content types, and nothing private is cached.
  // A route that sets its own Cache-Control keeps it.
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });

  app.route('/admin', adminRoutes(options));
  app.route('/u', uploadRoutes());

  app.notFound((c) => c.json({ error: 'not_found', message: 'Nu am găsit ce cauți.' }, 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, message: err.message }, err.status);
    console.error('API error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'internal', message: 'A apărut o eroare. Încearcă din nou.' }, 500);
  });
  return app;
}

export const app = createApp();
