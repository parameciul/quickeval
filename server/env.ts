import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Teacher } from '../shared/api.ts';
import type { EmailMessage } from './email.ts';
import type { PaidFeatures } from '../shared/payments.ts';
import type { CreateCheckoutSession } from './payments/stripe.ts';

// Bindings and settings of the Pages project (wrangler.toml, Pages settings, .dev.vars).
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  // Local development only: honoured only for requests to localhost or 127.0.0.1.
  DEV_TEACHER_EMAIL?: string;
  // "Evaluate now" (spec §12.6): the repository as owner/name, and a GitHub
  // token that may send it a repository_dispatch event.
  GITHUB_REPO?: string;
  GITHUB_DISPATCH_TOKEN?: string;
  // Emails to the administrators about new accounts (server/email.ts): a Brevo
  // API key, and the sender address verified in Brevo.
  BREVO_API_KEY?: string;
  EMAIL_FROM?: string;
  // Stripe (docs/payments.md): the secret API key and the webhook's signing
  // secret. Without both, paid features answer 503 payments_off.
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

// Parts of the app that tests replace.
export interface AppOptions {
  // Asks the robot to start at once; true when the request was taken.
  dispatchRobot?: (env: Env) => Promise<boolean>;
  // Sends an email; true when it was taken.
  sendEmail?: (env: Env, message: EmailMessage) => Promise<boolean>;
  // The features on sale (default PAID_FEATURES), and the call that makes a Stripe payment page.
  paidFeatures?: PaidFeatures;
  createCheckoutSession?: CreateCheckoutSession;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { teacher: Teacher };
}
