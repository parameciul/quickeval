import { describe, expect, it } from 'vitest';
import { isUsagePeriod, isUsageSource, usageKeys } from './usage.ts';

describe('usageKeys', () => {
  it('gives the last 7 days, today first', () => {
    expect(usageKeys('7d', '2026-11-18')).toEqual(['2026-11-18', '2026-11-17', '2026-11-16', '2026-11-15', '2026-11-14', '2026-11-13', '2026-11-12']);
  });

  it('crosses the start of a month and of a year', () => {
    expect(usageKeys('7d', '2027-01-02')).toEqual(['2027-01-02', '2027-01-01', '2026-12-31', '2026-12-30', '2026-12-29', '2026-12-28', '2026-12-27']);
  });

  it('gives 30 days, the oldest 29 days before today, across a leap day', () => {
    const keys = usageKeys('30d', '2028-03-10');
    expect(keys).toHaveLength(30);
    expect(keys[0]).toBe('2028-03-10');
    expect(keys).toContain('2028-02-29');
    expect(keys[29]).toBe('2028-02-10');
  });

  it('gives the last 12 calendar months, this month first', () => {
    expect(usageKeys('12m', '2026-11-30')).toEqual([
      '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06',
      '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12',
    ]);
  });
});

describe('the address values', () => {
  it('accept only the English sources and periods', () => {
    expect(['all', 'quick-try', 'teachers', 'toate', undefined].map(isUsageSource)).toEqual([true, true, true, false, false]);
    expect(['7d', '30d', '12m', '1y', undefined].map(isUsagePeriod)).toEqual([true, true, true, false, false]);
  });
});
