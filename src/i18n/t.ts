// The page's text in its language. Romanian is the key and the default; the
// English text is in src/i18n/en/. t() takes only a key the English dictionary
// has, so a new text without its English fails `npm run typecheck`, and
// scripts/i18n/scan.test.ts fails on visible text that does not go through t().
import { EN } from './en/index.ts';
import { currentLang, type Lang } from './lang.ts';

export type Key = keyof typeof EN;
export type Params = Readonly<Record<string, string | number>>;

function fill(text: string, params: Params | undefined): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

// The text in the page's language, with each {name} replaced by its parameter.
export function t(key: Key, params?: Params): string {
  return fill(currentLang() === 'en' ? EN[key] : key, params);
}

// The text in a language other than the page's.
export function tl(lang: Lang, key: Key, params?: Params): string {
  return fill(lang === 'en' ? EN[key] : key, params);
}

// Marks a key that is kept and translated later, where it is shown: a table of
// labels, a default.
export function k<K extends Key>(key: K): K {
  return key;
}

// A count with its word: Romanian "1 lucrare", "2 lucrări", "20 de lucrări"
// (20 or more, and round hundreds, take "de"); English "1 paper", "2 papers".
export function tc(count: number, one: Key, many: Key): string {
  if (count === 1) return `1 ${t(one)}`;
  if (currentLang() === 'en') return `${count} ${t(many)}`;
  const lastTwo = count % 100;
  // i18n-ignore
  return count > 0 && (lastTwo >= 20 || lastTwo === 0) ? `${count} de ${many}` : `${count} ${many}`;
}

// The locale for Intl: the dates and numbers of the page's language.
export function locale(): string {
  return currentLang() === 'en' ? 'en-GB' : 'ro-RO';
}
