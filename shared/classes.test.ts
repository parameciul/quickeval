import { describe, expect, it } from 'vitest';
import { compareClassNames, displayClassName, normalizeClassName } from './classes.ts';

describe('normalizeClassName', () => {
  it('removes spaces and makes the name uppercase', () => {
    expect(normalizeClassName(' 6 e2 ')).toBe('6E2');
    expect(normalizeClassName('11R1')).toBe('11R1');
  });

  it('refuses empty, too long, or non-Latin names', () => {
    expect(normalizeClassName('   ')).toBeNull();
    expect(normalizeClassName('123456789')).toBeNull();
    expect(normalizeClassName('6-E2')).toBeNull();
    expect(normalizeClassName('6Ă')).toBeNull();
  });
});

describe('displayClassName', () => {
  it('adds the Romanian word for class', () => {
    expect(displayClassName('6E2')).toBe('Clasa 6E2');
  });
});

describe('compareClassNames', () => {
  it('orders numbers inside names as numbers', () => {
    expect(['11R1', '9R2', '6E2'].sort(compareClassNames)).toEqual(['6E2', '9R2', '11R1']);
  });
});
