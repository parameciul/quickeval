import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router';
import { formatSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useApi } from './ApiContext.tsx';
import { ErrorMessage } from './ErrorMessage.tsx';
import { schoolYearOptions, useSchoolYear } from './SchoolYearContext.tsx';

export function Layout() {
  const api = useApi();
  const { year, setYear } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });

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
          <nav className="main-nav" aria-label="Meniu">
            <NavLink to="/clase">Clase</NavLink>
          </nav>
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
        {me.error ? <ErrorMessage error={me.error} /> : <Outlet />}
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>QuickEval{me.data ? ` · ${me.data.name}` : ''}</p>
        </div>
      </footer>
    </>
  );
}
