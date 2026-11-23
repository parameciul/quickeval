import { currentLang, otherLang, switchLang } from '../i18n/lang.ts';
import { ActionIcon } from './ActionIcon.tsx';
import { t } from '../i18n/t.ts';

// The language names, each in its own language: the same on every page.
const NAMES = { ro: 'Română', en: 'English' } as const;

// Shows the language it switches to ("EN" on a Romanian page), beside the
// theme button. The choice is saved in the browser and the page loads again.
export function LangButton() {
  const next = otherLang(currentLang());
  return (
    <button type="button" className="theme-btn lang-btn" lang={next} aria-label={NAMES[next]} onClick={() => switchLang(next)}>
      {next.toUpperCase()}
    </button>
  );
}

// The phone menu's row: "Limba" with the other language.
export function LangSwitch() {
  const next = otherLang(currentLang());
  return (
    <button type="button" className="menu-row" onClick={() => switchLang(next)}>
      <span className="menu-label">
        <ActionIcon name="globe" />
        {t('Limba')}
      </span>
      <span lang={next}>{NAMES[next]}</span>
    </button>
  );
}
