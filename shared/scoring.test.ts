import { describe, expect, it } from 'vitest';
import { formatPoints, gradeOf, isValidCorrection, round2, toCents } from './scoring.ts';

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

describe('toCents', () => {
  it('turns points with at most 2 decimals into whole cents', () => {
    expect(toCents(2.55)).toBe(255);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(10)).toBe(1000);
    expect(toCents(0)).toBe(0);
  });

  it('refuses more than 2 decimals', () => {
    expect(toCents(2.555)).toBeNull();
    expect(toCents(1 / 3)).toBeNull();
  });
});

describe('isValidCorrection', () => {
  it('takes points from 0 to the maximum in steps of 0.05', () => {
    expect(isValidCorrection(0, 4.5)).toBe(true);
    expect(isValidCorrection(2.35, 4.5)).toBe(true);
    expect(isValidCorrection(4.5, 4.5)).toBe(true);
  });

  it('refuses points off the 0.05 steps, below 0, or above the maximum', () => {
    expect(isValidCorrection(2.33, 4.5)).toBe(false);
    expect(isValidCorrection(2.555, 4.5)).toBe(false);
    expect(isValidCorrection(-0.05, 4.5)).toBe(false);
    expect(isValidCorrection(4.55, 4.5)).toBe(false);
  });

  it('takes a maximum that is off the steps, but nothing between it and the step below', () => {
    expect(isValidCorrection(0.33, 0.33)).toBe(true);
    expect(isValidCorrection(0.3, 0.33)).toBe(true);
    expect(isValidCorrection(0.32, 0.33)).toBe(false);
    expect(isValidCorrection(0.35, 0.33)).toBe(false);
  });
});

describe('formatPoints', () => {
  it('writes Romanian numbers', () => {
    expect(formatPoints(9.5)).toBe('9,5');
    expect(formatPoints(10)).toBe('10');
    expect(formatPoints(0.25)).toBe('0,25');
  });
});
