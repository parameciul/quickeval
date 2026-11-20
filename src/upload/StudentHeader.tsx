import { publicPath } from '../i18n/lang.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { LangButton } from '../ui/LangButton.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { t } from '../i18n/t.ts';

// Absolute, because student links also open on the old host, whose own pages
// are not for readers.
export const SITE_URL = `https://mqgrader.ro${publicPath('/')}`;
export const ABOUT_URL = `https://mqgrader.ro${publicPath('/about/')}`;

// The header of both student pages: the site's lockup, which opens the site,
// "Despre" and the theme button. Nothing here says how the work is graded.
export function StudentHeader() {
  return (
    <header className="site-header">
      <div className="wrap header-bar student-bar">
        <a className="brand" href={SITE_URL} aria-label={t('MQGrader by Laura Miron')}>
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">MQGrader</span>
            <span className="brand-by">by Laura Miron</span>
          </span>
        </a>
        <nav aria-label={t('Pagina')} className="student-nav">
          <a href={ABOUT_URL}>{t('Despre')}</a>
          <LangButton />
          <ThemeButton />
        </nav>
      </div>
    </header>
  );
}
