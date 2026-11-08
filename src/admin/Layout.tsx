import { useQuery, useQueryClient, type Query } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useMediaQuery } from '../ui/useMediaQuery.ts';
import { useApi } from './ApiContext.tsx';
import { ErrorMessage, isLoginRequired } from './ErrorMessage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { useSchoolYear } from './SchoolYearContext.tsx';
import { ClassesPanel } from './shell/ClassesPanel.tsx';
import { DemoButton } from './shell/DemoButton.tsx';
import { IconClose, IconMenu } from './shell/icons.tsx';
import { PhoneMenu } from './shell/PhoneMenu.tsx';
import { Rail, type PanelName } from './shell/Rail.tsx';
import { TodoPanel } from './shell/TodoPanel.tsx';
import { todoList } from './shell/todo.ts';
import { UserMenu } from './shell/UserMenu.tsx';
import { YearSelect } from './shell/YearSelect.tsx';

// The phone layout of brand.css: the bar at the bottom, a panel over the page.
const PHONE = '(max-width: 56.25rem)';

// The class of a /clase/:id page, for the panel to mark it.
function classOfPath(pathname: string): number | null {
  const match = matchPath({ path: '/clase/:id', end: false }, pathname);
  const id = Number(match?.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// The shell of the teacher app (redesign spec §4): the top bar, the 80px bar
// on the left, the page, and one side panel at a time. On a phone the bar
// moves to the bottom of the screen and ☰ opens the rest (brand.css).
export function Layout() {
  const api = useApi();
  const location = useLocation();
  const onTests = location.pathname === '/' || (location.pathname.startsWith('/teste') && location.pathname !== '/teste/nou');
  const onClasses = location.pathname.startsWith('/clase');
  const { year } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  // The tests of the year: "De făcut" and the panel of the classes read them.
  // They are read again every minute while the page is open (the robot ends a
  // grading on its own) and after every change (below).
  const tests = useQuery({
    queryKey: ['tests', year],
    queryFn: () => api.listTests(year),
    enabled: Boolean(me.data),
    refetchInterval: 60_000,
  });
  const todo = todoList(tests.data ?? []);
  // For an administrator: the accounts that confirmed their email and wait to
  // be approved. Setări reads the same list, so an approval there updates it.
  const admin = me.data?.role === 'admin';
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.listAccounts(),
    enabled: admin,
    refetchInterval: 60_000,
  });
  const approvals = admin ? (accounts.data ?? []).filter((account) => account.status === 'pending').length : 0;
  const others = (tests.data ?? []).filter((test) => !test.archived && test.status !== 'done' && !todo.some((item) => item.code === test.code)).length;
  // The open panel and the page it was opened on: another page closes it, and
  // it stays closed when Back or Forward returns to that page (the router gives
  // the page its old key again).
  const [panel, setPanel] = useState<{ name: PanelName; on: string } | null>(null);
  if (panel && panel.on !== location.key) setPanel(null);
  const open = panel?.on === location.key ? panel.name : null;
  const toggle = (name: PanelName) => setPanel(open === name ? null : { name, on: location.key });
  const close = useCallback(() => setPanel(null), []);
  const phone = useMediaQuery(PHONE);

  // A start, a regrade or a retry changes the papers the demo button shows, and
  // a change can end or add a thing in "De făcut": every change a logged-in
  // teacher makes reads the account and the tests of the year again. Only
  // what was not read since the change started, and joining a read already on
  // its way: a page that reads the list after its change does not cause a
  // second read, and nothing waits for this one.
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        const changed = event.type === 'updated' && event.action.type === 'success';
        if (!changed || !queryClient.getQueryData(['me'])) return;
        const since = event.mutation.state.submittedAt;
        // Read before the change started (a read in the same millisecond counts
        // as after it: the page's own read can follow that fast).
        const predicate = (query: Query) => query.state.dataUpdatedAt < since;
        void queryClient.invalidateQueries({ queryKey: ['me'], predicate }, { cancelRefetch: false });
        void queryClient.invalidateQueries({ queryKey: ['tests'], predicate }, { cancelRefetch: false });
        void queryClient.invalidateQueries({ queryKey: ['accounts'], predicate }, { cancelRefetch: false });
      }),
    [queryClient],
  );
  // Esc closes the open panel, unless a layer above it (the account menu, the
  // QR code on the whole screen) took this Esc first.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  // Nobody logged in: the login form takes the place of every page. The pages
  // wait for the login, so they never ask the API without it. The pages that
  // confirm a new account's email and set a new password need no login.
  const loggedOut = isLoginRequired(me.error);
  const openPage = location.pathname === '/confirma-email' || location.pathname === '/parola-noua';
  // These fill the screen under the top bar with the two halves of the way in.
  const wayIn = !me.data && (openPage || loggedOut);

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
          {/* A demo account's papers come first; logged out, the top bar
              has only the lockup and the theme. */}
          {me.data?.demo && <DemoButton teacher={me.data} />}
          {me.data && <YearSelect id="school-year" labelClassName="sr-only" />}
          <ThemeButton />
          {me.data && <UserMenu teacher={me.data} />}
        </div>
        {me.data && (
          <button
            type="button"
            className="menu-button"
            aria-label="Mai mult"
            aria-expanded={open === 'menu'}
            aria-controls={open === 'menu' ? 'phone-menu' : undefined}
            onClick={() => toggle('menu')}
          >
            {open === 'menu' ? <IconClose /> : <IconMenu />}
          </button>
        )}
        {me.data && open === 'menu' && <PhoneMenu teacher={me.data} onClose={close} />}
      </header>
      {me.data && (
        <Rail admin={me.data.role === 'admin'} onTests={onTests} onClasses={onClasses} todoCount={todo.length + (approvals > 0 ? 1 : 0)} urgent={approvals > 0} panel={open} onToggle={toggle} />
      )}
      {/* The panels come right after the bar that opens them, for the keyboard
          and screen readers. */}
      {me.data && open === 'clase' && (
        <ClassesPanel year={year} todo={todo} currentClassId={classOfPath(location.pathname)} onClose={() => setPanel(null)} />
      )}
      {me.data && open === 'todo' && (
        <TodoPanel items={todo} approvals={approvals} others={others} loading={!tests.data && !tests.error} error={tests.data ? null : tests.error} onClose={() => setPanel(null)} />
      )}
      {/* On a phone a panel covers the page: the page under it is out of reach. */}
      <main className={wayIn ? 'page page-way-in' : 'page'} inert={phone && (open === 'clase' || open === 'todo')}>
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
    </div>
  );
}
