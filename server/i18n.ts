import type { Context } from 'hono';
import { type MessageLang, translateLines, translateMessage } from '../shared/i18n/messages.ts';
import type { EmailMessage } from './email.ts';

// Keep equal to LANG_HEADER in src/i18n/lang.ts: the pages send it when they
// are English.
export const LANG_HEADER = 'X-MQ-Lang';

// The language of the page that made the request: English only when it says so.
export function requestLang(c: Context): MessageLang {
  return c.req.header(LANG_HEADER)?.toLowerCase() === 'en' ? 'en' : 'ro';
}

// A message the API answers with, in the request's language.
export function localMessage(c: Context, message: string): string {
  return translateMessage(message, requestLang(c));
}

// An email in the language of the page that made it send: the subject and
// every line translated. The server keeps no language per account, so an
// email to another person (an approval, a new account for the
// administrators) follows the page of the one who acted.
export function localEmail(c: Context, message: EmailMessage): EmailMessage {
  const lang = requestLang(c);
  return { ...message, subject: translateMessage(message.subject, lang), text: translateLines(message.text, lang) };
}
