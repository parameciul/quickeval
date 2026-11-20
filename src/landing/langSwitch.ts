// The language link of the public pages: "EN" on a Romanian page leads to its
// English copy, "RO" back. It is a plain link, so it works without script;
// the script saves the choice, so the reader's next visit (and the apps)
// opens in that language (public/lang.js).
import { currentLang, type Lang, saveLang, storedLang } from '../i18n/lang.ts';

export function initLangSwitch(root: ParentNode = document): void {
  // A reader who came straight to an English page (a search, a shared link)
  // keeps English in the apps it links to: the sign-in, the Quick Try.
  if (storedLang() === null && currentLang() === 'en') saveLang('en');
  for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]')) {
    // A click, or a middle click that opens it in a new tab: otherwise the
    // new tab would go back to the saved language.
    const save = () => {
      const lang = link.dataset.langSwitch;
      if (lang === 'en' || lang === 'ro') saveLang(lang as Lang);
    };
    link.addEventListener('click', save);
    link.addEventListener('auxclick', save);
  }
}
