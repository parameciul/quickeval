import type { Env } from './env.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Checks a Cloudflare Turnstile answer from the Quick Try form with Cloudflare.
// False for a refused answer, a missing secret, or a check that could not run:
// the try is then not made.
export async function verifyTurnstile(env: Env, token: string, ip: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetchImpl(SITEVERIFY, { method: 'POST', body: form });
    if (!res.ok) return false;
    const answer = (await res.json()) as { success?: unknown };
    return answer.success === true;
  } catch {
    return false;
  }
}
