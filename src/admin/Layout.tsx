import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { demoTestsLeft, DEMO_TEST_LIMIT } from '../../shared/accounts.ts';
import type { Teacher } from '../../shared/api.ts';
import { formatSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useApi } from './ApiContext.tsx';
import { ErrorMessage, isLoginRequired } from './ErrorMessage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { schoolYearOptions, useSchoolYear } from './SchoolYearContext.tsx';

// The line a demo account sees on every page.
export function demoText(teacher: Teacher): string {
  const left = demoTestsLeft(teacher.testsEvaluated);
  if (left === 0) {
    return `Cont demo: ai folosit toate cele ${DEMO_TEST_LIMIT} evaluări ale contului. Cere unui administrator un cont complet.`;
  }
  return `Cont demo: mai ai ${left} din ${DEMO_TEST_LIMIT} evaluări. Fiecare trimitere a unui test la corectare se numără, și o recorectare.`;
}

export function Layout() {
  const api = useApi();
  const location = useLocation();
  const onTests = location.pathname === '/' || location.pathname.startsWith('/teste');
  const { year, setYear } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  // Nobody logged in: the login form takes the place of every page. The pages
  // wait for the login, so they never ask the API without it. The page that
  // confirms a new account's email needs no login.
  const loggedOut = isLoginRequired(me.error);
  const openPage = location.pathname === '/confirma-email';

  return (
    <>
      <header className="site-header">
        <div className="wrap header-bar">
          <Link className="brand" to="/">
            <BrandMark />
            <span className="brand-text">
              <span className="brand-name">QuickEval</span>
              <span className="brand-sub">Matematică cu Laura Miron</span>
            </span>
          </Link>
          {me.data && (
            <nav className="main-nav" aria-label="Meniu">
              {/* Teste is the start page and also covers every /teste/... page. */}
              <Link to="/" aria-current={onTests ? 'page' : undefined}>
                Teste
              </Link>
              <NavLink to="/clase">Clase</NavLink>
              {me.data.role === 'admin' && <NavLink to="/setari">Setări</NavLink>}
              <NavLink to="/cont">Contul meu</NavLink>
            </nav>
          )}
          <div className="header-tools">
            <label className="sr-only" htmlFor="school-year">
              Anul școlar
            </label>
            <select id="school-year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {schoolYearOptions(schoolYearOf(new Date())).map((option) => (
                <option key={option} value={option}>
                  {formatSchoolYear(option)}
                </option>
              ))}
            </select>
            <ThemeButton />
          </div>
        </div>
      </header>
      <main className="wrap page">
        {me.data?.demo && <p className="warning">{demoText(me.data)}</p>}
        {openPage ? (
          <Outlet />
        ) : loggedOut ? (
          <LoginPage />
        ) : me.error ? (
          <ErrorMessage error={me.error} />
        ) : !me.data ? (
          <p>Se încarcă…</p>
        ) : (
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        )}
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>QuickEval{me.data ? ` · ${me.data.name}` : ''}</p>
        </div>
      </footer>
    </>
  );
}
