import { describe, expect, it } from 'vitest';
import { buildTestCode, cleanTitle, isUploadToken, normalizeTestCode } from './tests.ts';

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

describe('cleanTitle', () => {
  it('trims and joins inner whitespace', () => {
    expect(cleanTitle('  Test de   evaluare\n inițială ')).toBe('Test de evaluare inițială');
  });
});
