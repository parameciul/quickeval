// The language link of the public pages: "EN" on a Romanian page leads to its
// English copy, "RO" back. It is a plain link, so it works without script;
// the script saves the choice, so the reader's next visit (and the apps)
// opens in that language (public/lang.js).
import { type Lang, saveLang } from '../i18n/lang.ts';

export function initLangSwitch(root: ParentNode = document): void {
  for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]')) {
    link.addEventListener('click', () => {
      const lang = link.dataset.langSwitch;
      if (lang === 'en' || lang === 'ro') saveLang(lang as Lang);
    });
  }
}
