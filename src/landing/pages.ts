// The content pages' script (/guide/, /marking-scheme/, /about/, /pricing/):
// the entrances, the theme button and the header's menu. The Quick Try form
// lives on the landing page alone, so its code stays out of these pages.
import { initAccountLinks } from './account.ts';
import { initReveal } from './reveal.ts';
import { initLangSwitch } from './langSwitch.ts';
import { initSiteMenu } from './siteMenu.ts';
import { initThemeButton } from './themeButton.ts';

initReveal();
initThemeButton();
initSiteMenu();
initLangSwitch();
void initAccountLinks();
