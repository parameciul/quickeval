import { describe, expect, it } from 'vitest';
import { parsePositiveId } from './ids.ts';

describe('parsePositiveId', () => {
  it('accepts plain positive integers', () => {
    expect(parsePositiveId('1')).toBe(1);
    expect(parsePositiveId('12345')).toBe(12345);
  });

  it.each(['0', '012', '-1', '1e3', '0x10', ' 5 ', '5 ', '1.0', '', 'abc'])('refuses %j', (raw) => {
    expect(parsePositiveId(raw)).toBeNull();
  });

  it('refuses a missing value and numbers too big to be exact', () => {
    expect(parsePositiveId(undefined)).toBeNull();
    expect(parsePositiveId('9007199254740993')).toBeNull();
  });
});
