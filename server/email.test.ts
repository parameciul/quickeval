import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendBrevoEmail } from './email.ts';
import type { Env } from './env.ts';

const env = { BREVO_API_KEY: ' key-123 ', EMAIL_FROM: 'quickeval@example.com' } as Env;
const message = { to: ['a@example.com', 'b@example.com'], subject: 'Subiect', text: 'Text.' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendBrevoEmail', () => {
  it('posts the email to Brevo with the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 201 }));
    expect(await sendBrevoEmail(env, message, fetchImpl)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('key-123');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'QuickEval', email: 'quickeval@example.com' },
      to: [{ email: 'a@example.com' }, { email: 'b@example.com' }],
      subject: 'Subiect',
      textContent: 'Text.',
    });
  });

  it('sends nothing without the settings or without addresses', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 201 }));
    expect(await sendBrevoEmail({} as Env, message, fetchImpl)).toBe(false);
    expect(await sendBrevoEmail(env, { ...message, to: [] }, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers false, without throwing or logging the addresses, when Brevo refuses or is down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await sendBrevoEmail(env, message, vi.fn(async () => new Response('no', { status: 401 })))).toBe(false);
    expect(await sendBrevoEmail(env, message, vi.fn(async () => Promise.reject(new TypeError('a@example.com'))))).toBe(false);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('a@example.com');
  });
});
