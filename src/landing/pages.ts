// The content pages' script (/ghid/, /barem/, /despre/, /preturi/): the theme
// button and the header's menu. The Quick Try form lives on the landing page
// alone, so its code stays out of these pages.
import { initSiteMenu } from './siteMenu.ts';
import { initThemeButton } from './themeButton.ts';

initThemeButton();
initSiteMenu();
