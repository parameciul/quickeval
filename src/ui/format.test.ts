import { describe, expect, it } from 'vitest';
import { studentCountLabel } from './format.ts';

describe('studentCountLabel', () => {
  it('uses Romanian number words', () => {
    expect(studentCountLabel(0)).toBe('niciun elev');
    expect(studentCountLabel(1)).toBe('1 elev');
    expect(studentCountLabel(2)).toBe('2 elevi');
    expect(studentCountLabel(19)).toBe('19 elevi');
    expect(studentCountLabel(20)).toBe('20 de elevi');
    expect(studentCountLabel(28)).toBe('28 de elevi');
    expect(studentCountLabel(101)).toBe('101 elevi');
    expect(studentCountLabel(200)).toBe('200 de elevi');
  });
});
