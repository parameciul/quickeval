import { describe, expect, it } from 'vitest';
import { initials } from './initials.ts';

describe('initials', () => {
  it('takes the first letters of the first and the last word', () => {
    expect(initials('Laura Miron')).toBe('LM');
    expect(initials('  ana  maria   pop ')).toBe('AP');
  });

  it('keeps Romanian letters and one word', () => {
    expect(initials('ștefan țurcanu')).toBe('ȘȚ');
    expect(initials('Laura')).toBe('L');
  });

  it('shows a question mark for an empty name', () => {
    expect(initials('   ')).toBe('?');
  });
});
