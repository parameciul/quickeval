import { handle } from 'hono/cloudflare-pages';
import { app } from '../../server/app.ts';

// Cloudflare Pages sends every /api/* request here (see public/_routes.json).
export const onRequest = handle(app);
