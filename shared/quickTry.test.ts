import { describe, expect, it } from 'vitest';
import { asksBaremAfterTest, parsePhoneParts, PHONE_IDLE_MS, PHONE_IDLE_TEXT, PHONE_REFRESH_MS, phonePartsOf, quickTryPhonePath } from './quickTry.ts';

describe("a try's phone page", () => {
  it('has its address under the try', () => {
    expect(quickTryPhonePath('abc')).toBe('/try/abc/phone');
  });

  it('marks the phone page opened on the same phone as the form', () => {
    expect(quickTryPhonePath('abc', true)).toBe('/try/abc/phone?here=1');
  });

  it('is watched every 3 seconds, for 15 minutes with no new page', () => {
    expect(PHONE_REFRESH_MS).toBe(3000);
    expect(PHONE_IDLE_MS).toBe(15 * 60 * 1000);
  });

  it('says the idle time from the constant', () => {
    expect(PHONE_IDLE_TEXT).toBe('Nu a venit nicio pagină de 15 minute.');
  });
});

describe('the parts a phone page takes', () => {
  const tryOf = (test: unknown, barem: unknown, request = 'none', unchecked = false) => ({ files: { test, barem }, barem: { request, unchecked } });

  it('names the test and the barem in the address, in English, with the other parameters', () => {
    expect(quickTryPhonePath('abc', false, 'ro', ['pages', 'test', 'barem'])).toBe('/try/abc/phone?parts=test,marking-scheme,pages');
    expect(quickTryPhonePath('abc', true, 'en', ['barem'])).toBe('/try/abc/phone?here=1&parts=marking-scheme&lang=en');
  });

  it('keeps the old address for the pages alone', () => {
    expect(quickTryPhonePath('abc', false, 'ro', ['pages'])).toBe('/try/abc/phone');
  });

  it('reads the parts back in their order, skipping names it does not know', () => {
    expect(parsePhoneParts('pages,marking-scheme,test')).toEqual(['test', 'barem', 'pages']);
    expect(parsePhoneParts('pages,barem')).toEqual(['pages']);
    expect(parsePhoneParts('nothing')).toBeNull();
    expect(parsePhoneParts(null)).toBeNull();
  });

  it('without a list, takes what the try misses and always the pages', () => {
    expect(phonePartsOf(tryOf(null, null))).toEqual(['test', 'barem', 'pages']);
    expect(phonePartsOf(tryOf({}, {}))).toEqual(['pages']);
    expect(phonePartsOf(tryOf({}, null, 'requested'))).toEqual(['pages']);
  });

  it('asks for the barem after the test only when she chose none of her own and the try never asked', () => {
    expect(asksBaremAfterTest(['test', 'pages'], tryOf({}, null))).toBe(true);
    expect(asksBaremAfterTest(['test', 'barem', 'pages'], tryOf({}, null))).toBe(false);
    expect(asksBaremAfterTest(['test'], tryOf({}, {}))).toBe(false);
    expect(asksBaremAfterTest(['test'], tryOf({}, null, 'requested'))).toBe(false);
    expect(asksBaremAfterTest(['test'], tryOf({}, null, 'failed'))).toBe(false);
  });
});
