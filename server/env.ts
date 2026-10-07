import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Teacher } from '../shared/api.ts';

// Bindings and settings of the Pages project (wrangler.toml, Pages settings, .dev.vars).
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  // Local development only: honoured only for requests to localhost or 127.0.0.1.
  DEV_TEACHER_EMAIL?: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { teacher: Teacher };
}
