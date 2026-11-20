import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage } from './email.ts';
import { startTestApi, type TestApi } from './test/testApi.ts';

let api: TestApi;
let emails: EmailMessage[];

beforeEach(async () => {
  emails = [];
  api = await startTestApi({
    env: { DEV_TEACHER_EMAIL: undefined },
    app: {
      sendEmail: async (_env, message) => {
        emails.push(message);
        return true;
      },
    },
  });
});

afterEach(async () => {
  await api.dispose();
});

const ENGLISH = { 'X-MQ-Lang': 'en' };

describe('the language of the API', () => {
  it('answers in Romanian by default', async () => {
    const res = await api.request('GET', '/api/nowhere');
    expect(res.body).toEqual({ error: 'not_found', message: 'Nu am găsit ce cauți.' });
  });

  it('answers in English when the page is English', async () => {
    const res = await api.request('GET', '/api/nowhere', undefined, ENGLISH);
    expect(res.body).toEqual({ error: 'not_found', message: 'I could not find what you are looking for.' });
    const wrong = await api.request('POST', '/api/auth/login', { email: 'nimeni@example.com', password: 'orice-parola' }, ENGLISH);
    expect(wrong.body).toMatchObject({ message: 'The email or the password is not right. After 10 wrong attempts, the account is locked for 15 minutes.' });
  });

  it('writes the email of an English page in English', async () => {
    const res = await api.request('POST', '/api/auth/signup', { name: 'Ana Pop', email: 'ana.pop@example.com', password: 'parola-lunga' }, ENGLISH);
    expect(res.status).toBe(201);
    expect(emails[0]!.subject).toBe('MQGrader: confirm your email address');
    expect(emails[0]!.text).toMatch(/^Hello, Ana Pop!\n\nYou asked for an MQGrader account\. Confirm that the address is yours:\nhttp:\/\/localhost\/teacher\/confirm-email#/);
    expect(emails[0]!.text).toContain('If you did not ask for the account, ignore this email.');
  });
});
