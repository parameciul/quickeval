import { BrandMark } from '../ui/BrandMark.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';

// Absolute, because student links also open on the old host, whose own pages
// are not for readers.
export const SITE_URL = 'https://mqgrader.ro/';
export const ABOUT_URL = 'https://mqgrader.ro/despre/';

// The header of both student pages: the site's lockup, which opens the site,
// "Despre" and the theme button. Nothing here says how the work is graded.
export function StudentHeader() {
  return (
    <header className="site-header">
      <div className="wrap header-bar student-bar">
        <a className="brand" href={SITE_URL} aria-label="MQGrader by Laura Miron">
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">MQGrader</span>
            <span className="brand-by">by Laura Miron</span>
          </span>
        </a>
        <nav aria-label="Site" className="student-nav">
          <a href={ABOUT_URL}>Despre</a>
          <ThemeButton />
        </nav>
      </div>
    </header>
  );
}
