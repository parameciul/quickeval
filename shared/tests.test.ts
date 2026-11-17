import { describe, expect, it } from 'vitest';
import {
  buildTestCode,
  cleanTitle,
  formatResultCode,
  isResultToken,
  isUploadToken,
  normalizeResultCode,
  normalizeTestCode,
  RESULT_CODE_ALPHABET,
} from './tests.ts';

describe('buildTestCode', () => {
  it('joins the class, the last two digits of the school year, and the number', () => {
    expect(buildTestCode('6E2', 2026, 1)).toBe('6E2-26T1');
    expect(buildTestCode('11R1', 2027, 12)).toBe('11R1-27T12');
    expect(buildTestCode('5A', 2100, 3)).toBe('5A-00T3');
  });
});

describe('normalizeTestCode', () => {
  it('accepts codes in any letter case', () => {
    expect(normalizeTestCode('6E2-26T1')).toBe('6E2-26T1');
    expect(normalizeTestCode('6e2-26t1')).toBe('6E2-26T1');
  });

  it.each(['', '6E2', '6E2-26', '6E2-2026T1', '6E2-26T1000', '6-E2-26T1', 'ABCDEFGHI-26T1', '6E2_26T1'])('refuses %j', (raw) => {
    expect(normalizeTestCode(raw)).toBeNull();
  });
});

describe('isUploadToken', () => {
  it('accepts 16 characters from a-z and 2-7 only', () => {
    expect(isUploadToken('abcdefghijklmn27')).toBe(true);
    expect(isUploadToken('abcdefghijklmn2')).toBe(false);
    expect(isUploadToken('abcdefghijklmn28')).toBe(false);
    expect(isUploadToken('ABCDEFGHIJKLMN27')).toBe(false);
  });
});

describe('isResultToken', () => {
  it('accepts 24 characters from a-z and 2-7 only, so no upload token matches', () => {
    expect(isResultToken('abcdefghijkmnop2abcdefcd')).toBe(true);
    expect(isResultToken('abcdefghijkmnop2')).toBe(false);
    expect(isResultToken('abcdefghijkmnop2abcdefc8')).toBe(false);
    expect(isResultToken('abcdefghijkmnop2abcdefcD')).toBe(false);
  });
});

describe('result codes', () => {
  it('uses 31 characters, none of them easy to confuse', () => {
    expect(RESULT_CODE_ALPHABET).toHaveLength(31);
    expect(RESULT_CODE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(new Set(RESULT_CODE_ALPHABET).size).toBe(31);
  });

  it('reads a code in any letter case, with or without the dash and spaces', () => {
    expect(normalizeResultCode('K7M92P')).toBe('K7M92P');
    expect(normalizeResultCode('k7m-92p')).toBe('K7M92P');
    expect(normalizeResultCode('  K7M 92P ')).toBe('K7M92P');
    expect(normalizeResultCode('k7m - 92p')).toBe('K7M92P');
  });

  it('refuses what is not a code', () => {
    expect(normalizeResultCode('')).toBeNull();
    expect(normalizeResultCode('K7M92')).toBeNull();
    expect(normalizeResultCode('K7M92PP')).toBeNull();
    // 0, O, 1, I and L are not in the alphabet.
    expect(normalizeResultCode('K7M90P')).toBeNull();
    expect(normalizeResultCode('K7MO2P')).toBeNull();
    expect(normalizeResultCode('K1M92P')).toBeNull();
    expect(normalizeResultCode('KIM92P')).toBeNull();
    expect(normalizeResultCode('KLM92P')).toBeNull();
    expect(normalizeResultCode('K7M92Ș')).toBeNull();
  });

  it('shows a code with a dash in the middle', () => {
    expect(formatResultCode('K7M92P')).toBe('K7M-92P');
  });
});

describe('cleanTitle', () => {
  it('trims and joins inner whitespace', () => {
    expect(cleanTitle('  Test de   evaluare\n inițială ')).toBe('Test de evaluare inițială');
  });
});
