import { useState } from 'react';
import { currentTheme, otherTheme, saveTheme, storedTheme, systemPrefersDark } from './theme.ts';

// Shows a moon in light mode and a sun in dark mode: the icon offers the other theme.
export function ThemeButton() {
  const [theme, setTheme] = useState(() => currentTheme(storedTheme(), systemPrefersDark()));
  const next = otherTheme(theme);
  return (
    <button
      type="button"
      className="theme-btn"
      aria-label={next === 'dark' ? 'Temă întunecată' : 'Temă luminoasă'}
      onClick={() => {
        saveTheme(next);
        setTheme(next);
      }}
    >
      {next === 'dark' ? (
        <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M20 14.5 A8.5 8.5 0 0 1 9.5 4 a8.5 8.5 0 1 0 10.5 10.5 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2.5 v2.2 M12 19.3 v2.2 M2.5 12 h2.2 M19.3 12 h2.2" />
            <path d="M5.3 5.3 l1.6 1.6 M17.1 17.1 l1.6 1.6 M18.7 5.3 l-1.6 1.6 M6.9 17.1 l-1.6 1.6" />
          </g>
        </svg>
      )}
    </button>
  );
}
