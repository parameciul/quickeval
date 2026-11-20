// The language of the page: Romanian by default, English when the reader chose
// it. public/lang.js reads the saved choice before the page paints and puts it
// in <html lang>; the code reads it from there, so one page never mixes two
// languages. A change saves the choice and loads the page again.

export type Lang = 'ro' | 'en';

// Keep equal to the key in public/lang.js.
export const LANG_KEY = 'quickeval.lang';

// The header every API request carries when the page is English: the API then
// answers its messages in English (server/i18n.ts).
export const LANG_HEADER = 'X-MQ-Lang';

export function currentLang(): Lang {
  if (typeof document === 'undefined') return 'ro';
  return document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'ro';
}

export function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'ro' : 'en';
}

export function storedLang(): Lang | null {
  try {
    const value = localStorage.getItem(LANG_KEY);
    return value === 'en' || value === 'ro' ? value : null;
  } catch {
    return null;
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
}

// The headers that tell the API the page's language.
export function langHeaders(): Record<string, string> {
  return currentLang() === 'en' ? { [LANG_HEADER]: 'en' } : {};
}

// Saves the choice and loads the page again in that language.
export function switchLang(lang: Lang): void {
  saveLang(lang);
  location.reload();
}

// A public page's path in the page's language: "/about/" or "/en/about/".
export function publicPath(path: string): string {
  return currentLang() === 'en' ? `/en${path}` : path;
}
