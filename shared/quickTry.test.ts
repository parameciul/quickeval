import { describe, expect, it } from 'vitest';
import { PHONE_IDLE_MS, PHONE_IDLE_TEXT, PHONE_REFRESH_MS, quickTryPhonePath } from './quickTry.ts';

describe("a try's phone page", () => {
  it('has its address under the try', () => {
    expect(quickTryPhonePath('abc')).toBe('/try/abc/telefon');
  });

  it('marks the phone page opened on the same phone as the form', () => {
    expect(quickTryPhonePath('abc', true)).toBe('/try/abc/telefon?aici=1');
  });

  it('is watched every 3 seconds, for 15 minutes with no new page', () => {
    expect(PHONE_REFRESH_MS).toBe(3000);
    expect(PHONE_IDLE_MS).toBe(15 * 60 * 1000);
  });

  it('says the idle time from the constant', () => {
    expect(PHONE_IDLE_TEXT).toBe('Nu a venit nicio pagină de 15 minute.');
  });
});
