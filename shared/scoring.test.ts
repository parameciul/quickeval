import { describe, expect, it } from 'vitest';
import { formatPoints, gradeOf, round2 } from './scoring.ts';

describe('round2', () => {
  it('rounds to 2 decimals, halves up', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.344)).toBe(2.34);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(7)).toBe(7);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1.115)).toBe(1.12);
  });
});

describe('gradeOf', () => {
  it('turns a total into a grade out of 10', () => {
    expect(gradeOf(10, 10)).toBe(10);
    expect(gradeOf(7.5, 10)).toBe(7.5);
    expect(gradeOf(87, 100)).toBe(8.7);
    expect(gradeOf(2, 3)).toBe(6.67);
    expect(gradeOf(21.75, 100)).toBe(2.18);
    expect(gradeOf(24.25, 100)).toBe(2.43);
  });
});

describe('formatPoints', () => {
  it('writes Romanian numbers', () => {
    expect(formatPoints(9.5)).toBe('9,5');
    expect(formatPoints(10)).toBe('10');
    expect(formatPoints(0.25)).toBe('0,25');
  });
});
