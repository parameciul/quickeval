import { afterEach, describe, expect, it } from 'vitest';
import { currentTheme, otherTheme, saveTheme, storedTheme, THEME_KEY } from './theme.ts';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme', () => {
  it('uses the saved choice before the system setting', () => {
    expect(currentTheme('light', true)).toBe('light');
    expect(currentTheme(null, true)).toBe('dark');
    expect(currentTheme(null, false)).toBe('light');
  });

  it('switches to the other theme', () => {
    expect(otherTheme('light')).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
  });

  it('saves the choice and applies it to the page', () => {
    saveTheme('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(storedTheme()).toBe('dark');
  });

  it('ignores an unknown saved value', () => {
    localStorage.setItem(THEME_KEY, 'purple');
    expect(storedTheme()).toBeNull();
  });
});
