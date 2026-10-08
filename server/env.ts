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
  // "Evaluate now" (spec §12.6): the repository as owner/name, and a GitHub
  // token that may send it a repository_dispatch event.
  GITHUB_REPO?: string;
  GITHUB_DISPATCH_TOKEN?: string;
}

// Parts of the app that tests replace.
export interface AppOptions {
  // Asks the robot to start at once; true when the request was taken.
  dispatchRobot?: (env: Env) => Promise<boolean>;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { teacher: Teacher };
}
