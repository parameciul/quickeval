import { describe, expect, it } from 'vitest';
import { formatSchoolYear, isValidSchoolYear, schoolYearOf } from './schoolYear.ts';

describe('schoolYearOf', () => {
  it('puts October in the school year that started that September', () => {
    expect(schoolYearOf(new Date('2026-10-06T08:00:00Z'))).toBe(2026);
  });

  it('puts March in the school year that started the year before', () => {
    expect(schoolYearOf(new Date('2027-03-01T08:00:00Z'))).toBe(2026);
  });

  it('switches at midnight Romania time, not UTC', () => {
    // 2026-08-31 21:30 UTC is 2026-09-01 00:30 in Bucharest (UTC+3 in summer).
    expect(schoolYearOf(new Date('2026-08-31T21:30:00Z'))).toBe(2026);
    // 2026-08-31 20:00 UTC is still 23:00 on 31 August in Bucharest.
    expect(schoolYearOf(new Date('2026-08-31T20:00:00Z'))).toBe(2025);
  });
});

describe('formatSchoolYear', () => {
  it('shows both calendar years', () => {
    expect(formatSchoolYear(2026)).toBe('2026-2027');
  });
});

describe('isValidSchoolYear', () => {
  it('accepts whole years from 2020 to 2100', () => {
    expect(isValidSchoolYear(2026)).toBe(true);
    expect(isValidSchoolYear(2019)).toBe(false);
    expect(isValidSchoolYear(2026.5)).toBe(false);
    expect(isValidSchoolYear(Number.NaN)).toBe(false);
  });
});
