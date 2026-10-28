import type { AppOptions, Env } from './env.ts';

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}

// Sends a plain-text email through Brevo's API (free plan: 300 emails a day,
// no own domain needed). True when Brevo took it. False without the settings
// BREVO_API_KEY and EMAIL_FROM, or when Brevo refuses or does not answer in 5
// seconds. Never throws: an email only tells about something the app also
// shows (Setări lists the accounts that wait). Logs one line without the
// addresses when it fails.
export async function sendBrevoEmail(env: Env, message: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const key = env.BREVO_API_KEY?.trim() ?? '';
  const from = env.EMAIL_FROM?.trim() ?? '';
  if (key === '' || from === '' || message.to.length === 0) return false;
  try {
    const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        sender: { name: 'QuickEval', email: from },
        to: message.to.map((email) => ({ email })),
        subject: message.subject,
        textContent: message.text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return true;
    console.warn(`Brevo refused the email: HTTP ${res.status}`);
    return false;
  } catch (err) {
    console.warn(`Brevo email failed: ${err instanceof Error ? err.name : 'unknown error'}`);
    return false;
  }
}

export function emailSender(options: AppOptions): (env: Env, message: EmailMessage) => Promise<boolean> {
  return options.sendEmail ?? ((env, message) => sendBrevoEmail(env, message));
}
