import { describe, expect, it } from 'vitest';
import { classToneClass, classToneHue, classToneStyle } from './classTone.ts';

describe('classTone', () => {
  it('gives the first 40 class ids 40 different hues', () => {
    const hues = new Set(Array.from({ length: 40 }, (_, index) => classToneHue(index + 1)));
    expect(hues.size).toBe(40);
  });

  it('keeps the hue of a class id', () => {
    expect(classToneHue(5)).toBe(classToneHue(5));
    expect(classToneHue(1)).toBe(138);
  });

  it('keeps neighbouring ids at least 20 degrees apart', () => {
    for (let id = 1; id < 30; id += 1) {
      const gap = Math.abs(classToneHue(id) - classToneHue(id + 1));
      expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(20);
    }
  });

  it('sets the hue and the lightness as CSS variables', () => {
    expect(classToneClass()).toBe('class-tone');
    expect(classToneStyle(1)).toEqual({ '--tone-hue': 138, '--tone-light': '76%' });
  });
});
