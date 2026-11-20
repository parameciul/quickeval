import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initAccountLinks, showAccount } from './account.ts';

const HEADER = `
  <nav>
    <a href="/teacher/" data-guest>Intră în cont</a>
    <a href="/teacher/" data-member hidden>Contul tău</a>
  </nav>`;

const guest = () => document.querySelector<HTMLElement>('[data-guest]')!;
const member = () => document.querySelector<HTMLElement>('[data-member]')!;

const answer = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  document.body.innerHTML = HEADER;
});

describe('showAccount', () => {
  it('shows the account link to a teacher who is logged in', () => {
    showAccount(document, true);
    expect(guest().hidden).toBe(true);
    expect(member().hidden).toBe(false);
  });

  it('shows the login again when the teacher is logged out', () => {
    showAccount(document, true);
    showAccount(document, false);
    expect(guest().hidden).toBe(false);
    expect(member().hidden).toBe(true);
  });
});

describe('initAccountLinks', () => {
  it('asks the API and shows the account link when a teacher is logged in', async () => {
    const fetchImpl = answer({ signedIn: true });
    await initAccountLinks(document, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ credentials: 'same-origin' }));
    expect(member().hidden).toBe(false);
    expect(guest().hidden).toBe(true);
  });

  it('keeps the login for a visitor', async () => {
    await initAccountLinks(document, answer({ signedIn: false }));
    expect(guest().hidden).toBe(false);
    expect(member().hidden).toBe(true);
  });

  it('keeps the login when the API fails or answers an error', async () => {
    await initAccountLinks(document, vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(guest().hidden).toBe(false);
    await initAccountLinks(document, answer({ signedIn: true }, 500));
    expect(guest().hidden).toBe(false);
    await initAccountLinks(document, vi.fn(async () => new Response('not json', { status: 200 })));
    expect(guest().hidden).toBe(false);
    expect(member().hidden).toBe(true);
  });
});
