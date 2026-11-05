import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router';
import { demoPapersLeft, DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import type { Teacher } from '../../shared/api.ts';
import { formatSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useApi } from './ApiContext.tsx';
import { ErrorMessage, isLoginRequired } from './ErrorMessage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { schoolYearOptions, useSchoolYear } from './SchoolYearContext.tsx';
import { ClassesPanel } from './shell/ClassesPanel.tsx';
import { Rail, type PanelName } from './shell/Rail.tsx';
import { UserMenu } from './shell/UserMenu.tsx';

// The line a demo account sees on every page.
export function demoText(teacher: Teacher): string {
  const left = demoPapersLeft(teacher.papersGraded + teacher.papersWaiting);
  if (left === 0) {
    return `Cont demo: ai folosit toate cele ${DEMO_PAPER_LIMIT} lucrări ale contului. Cere unui administrator un cont complet.`;
  }
  return `Cont demo: mai ai ${left} din ${DEMO_PAPER_LIMIT} lucrări. Fiecare lucrare corectată se numără, și o recorectare.`;
}

// The class of a /clase/:id page, for the panel to mark it.
function classOfPath(pathname: string): number | null {
  const match = matchPath({ path: '/clase/:id', end: false }, pathname);
  const id = Number(match?.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// The shell of the teacher app (redesign spec §4): the top bar, the 80px bar
// on the left, the page, and one side panel at a time.
export function Layout() {
  const api = useApi();
  const location = useLocation();
  const onTests = location.pathname === '/' || (location.pathname.startsWith('/teste') && location.pathname !== '/teste/nou');
  const onClasses = location.pathname.startsWith('/clase');
  const { year, setYear } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  // The open panel and the page it was opened on: another page closes it.
  const [panel, setPanel] = useState<{ name: PanelName; on: string } | null>(null);
  const open = panel?.on === location.key ? panel.name : null;
  const toggle = (name: PanelName) => setPanel(open === name ? null : { name, on: location.key });

  // A start, a regrade or a retry changes the papers the demo line shows:
  // every change a logged-in teacher makes reads the account again.
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        const changed = event.type === 'updated' && event.action.type === 'success';
        if (changed && queryClient.getQueryData(['me'])) void queryClient.invalidateQueries({ queryKey: ['me'] });
      }),
    [queryClient],
  );
  // Esc closes the open panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  // Nobody logged in: the login form takes the place of every page. The pages
  // wait for the login, so they never ask the API without it. The page that
  // confirms a new account's email needs no login.
  const loggedOut = isLoginRequired(me.error);
  const openPage = location.pathname === '/confirma-email';

  return (
    <div className={me.data ? 'shell' : 'shell shell-bare'}>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="MQGrader by Laura Miron">
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">MQGrader</span>
            <span className="brand-by">by Laura Miron</span>
          </span>
        </Link>
        <div className="topbar-tools">
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
          {me.data && <UserMenu teacher={me.data} />}
        </div>
      </header>
      {me.data && <Rail admin={me.data.role === 'admin'} onTests={onTests} onClasses={onClasses} panel={open} onToggle={toggle} />}
      <main className="page">
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
      {me.data && open === 'clase' && <ClassesPanel year={year} currentClassId={classOfPath(location.pathname)} onClose={() => setPanel(null)} />}
    </div>
  );
}
