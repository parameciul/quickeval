import { describe, expect, it } from 'vitest';
import { classTone, classToneClass } from './classTone.ts';

describe('classTone', () => {
  it('is the class id modulo 8', () => {
    expect(classTone(1)).toBe(1);
    expect(classTone(8)).toBe(0);
    expect(classTone(13)).toBe(5);
  });

  it('names the CSS class of the tone', () => {
    expect(classToneClass(1)).toBe('class-tone-1');
    expect(classToneClass(16)).toBe('class-tone-0');
  });
});
