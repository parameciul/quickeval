import { afterEach, describe, expect, it } from 'vitest';
import themeScript from '../../public/theme.js?raw';
import { currentTheme, otherTheme, saveTheme, storedTheme, THEME_KEY } from './theme.ts';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme', () => {
  it('uses the saved choice, else light: the system setting does not count', () => {
    expect(currentTheme('dark')).toBe('dark');
    expect(currentTheme('light')).toBe('light');
    expect(currentTheme(null)).toBe('light');
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

// public/theme.js runs in the head of every page, before the stylesheet.
describe('the theme script of the page head', () => {
  const run = () => new Function(themeScript)();

  it('paints light when nothing is saved', () => {
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('paints the saved choice', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('paints light when the saved value is unknown', () => {
    localStorage.setItem(THEME_KEY, 'purple');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
