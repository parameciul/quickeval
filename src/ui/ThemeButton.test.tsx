import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY } from './theme.ts';
import { ThemeButton } from './ThemeButton.tsx';

// A system set to dark: the page still opens light.
function systemDark() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('the theme button', () => {
  it('offers the dark theme on a first visit, even when the system is dark', () => {
    systemDark();
    render(<ThemeButton />);
    expect(screen.getByRole('button', { name: 'Temă întunecată' })).toBeInTheDocument();
  });

  it('switches to dark and back, and keeps the choice', async () => {
    render(<ThemeButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Temă întunecată' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Temă luminoasă' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('starts from the saved choice', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeButton />);
    expect(screen.getByRole('button', { name: 'Temă luminoasă' })).toBeInTheDocument();
  });
});
