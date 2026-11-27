import { describe, expect, it } from 'vitest';
import { asksBaremAfter, isPhoneToken, missingPhoneParts, parsePhoneAsk, testPhonePath, type PhoneLinkInfo } from './testPhone.ts';

const TOKEN = 'a'.repeat(40);

const info = (over: Partial<PhoneLinkInfo> = {}): PhoneLinkInfo => ({
  code: '6E2-26T1',
  title: 'Fracții',
  className: '6E2',
  expiresAt: '2026-10-07T10:00:00.000Z',
  ces: false,
  files: { test: false, barem: false, cesTest: false, cesBarem: false },
  barem: { request: 'none', unchecked: false },
  cesBarem: { request: 'none', unchecked: false },
  ...over,
});

describe('the phone link of a test', () => {
  it('takes only tokens of 40 characters from a-z and 2-7', () => {
    expect(isPhoneToken(TOKEN)).toBe(true);
    expect(isPhoneToken('a'.repeat(32))).toBe(false);
    expect(isPhoneToken('A'.repeat(40))).toBe(false);
    expect(isPhoneToken(`${'a'.repeat(39)}1`)).toBe(false);
  });

  it('names its parts in English in the address, in their order, and reads them back', () => {
    const path = testPhonePath(TOKEN, { parts: ['cesTest', 'test', 'barem'], fromTest: ['cesBarem'] }, true, 'en');
    expect(path).toBe(`/phone/${TOKEN}?parts=test,marking-scheme,sen-test&from-test=sen-marking-scheme&here=1&lang=en`);
    expect(parsePhoneAsk(new URL(path, 'https://mqgrader.ro').searchParams)).toEqual({ parts: ['test', 'barem', 'cesTest'], fromTest: ['cesBarem'] });
    expect(testPhonePath(TOKEN, { parts: [], fromTest: [] })).toBe(`/phone/${TOKEN}`);
  });

  it('reads no ask from an address without known parts', () => {
    expect(parsePhoneAsk(new URLSearchParams(''))).toBeNull();
    expect(parsePhoneAsk(new URLSearchParams('parts=pages,barem'))).toBeNull();
  });

  it('takes what the test misses when the address names nothing: the CES parts only when they are wanted', () => {
    expect(missingPhoneParts(info())).toEqual(['test', 'barem']);
    expect(missingPhoneParts(info({ ces: true }))).toEqual(['test', 'barem', 'cesTest', 'cesBarem']);
    const some = info({ ces: true, files: { test: true, barem: false, cesTest: false, cesBarem: true }, barem: { request: 'requested', unchecked: false } });
    expect(missingPhoneParts(some)).toEqual(['cesTest']);
  });

  it('asks for a barem made from the test only when she chose it and the variant has none', () => {
    const ask = { parts: ['test' as const, 'cesTest' as const], fromTest: ['barem' as const] };
    expect(asksBaremAfter('test', ask, info())).toBe(true);
    expect(asksBaremAfter('cesTest', ask, info())).toBe(false);
    expect(asksBaremAfter('test', ask, info({ barem: { request: 'requested', unchecked: false } }))).toBe(false);
    expect(asksBaremAfter('test', ask, info({ files: { test: true, barem: true, cesTest: false, cesBarem: false } }))).toBe(false);
    expect(asksBaremAfter('barem', ask, info())).toBe(false);
  });
});
