import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestInfo } from '../../shared/api.ts';
import { createFakeApi, fakeAccount, fakeTeacher, fakeTest } from '../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../test/renderAdmin.tsx';
import { ApiError } from './api.ts';

// A screen as narrow as a phone (below 900px), for the code that asks.
// The files of a draft or open test that misses nothing.
const file = { name: 'f.pdf', type: 'application/pdf' };
const files = { test: file, barem: file };

const onPhone = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 56.25rem)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

// The browser's Back button: the router gives the page it returns to the key
// that page had before.
function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Înapoi în istoric
    </button>
  );
}

const withBack = (
  <>
    <LocationProbe />
    <BackButton />
  </>
);
// The paper page's moves replace the address; a stage of the test page changes
// only the hash.
function MoveButtons() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => void navigate('/cont', { replace: true })}>
        Înlocuiește adresa
      </button>
      <button type="button" onClick={() => void navigate('/cont#x')}>
        Alt hash
      </button>
    </>
  );
}

const back = () => userEvent.click(screen.getByRole('button', { name: 'Înapoi în istoric' }));

// The open test misses its files unless given them.
const withClasses = (open: Partial<TestInfo> = {}) =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 3, name: '5A', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true, ces: false }] },
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', ...open }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done' }),
    ],
  });

// Three things wait: a generated barem, points to check, results to publish.
const withTodo = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T3', title: 'Logaritmi', status: 'done', gradedCount: 20 }),
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'done', gradedCount: 24, flagCount: 3 }),
      fakeTest({ code: '6E3-26T1', title: 'Inducție', classId: 2, className: '6E3', barem: { request: 'none', unchecked: true }, files }),
      fakeTest({ code: '6E3-26T2', title: 'Mulțimi', classId: 2, className: '6E3', status: 'open', files }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', gradedCount: 20, resultsOpen: true }),
    ],
  });

const menu = () => screen.findByRole('navigation', { name: 'Meniu' });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the shell', () => {
  it('shows the lockup in the top bar, and no footer', async () => {
    renderAdmin('/', withClasses());
    await menu();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(banner).toHaveTextContent('MQGraderby Laura Miron');
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('has Test nou, Teste, Clase and De făcut in the bar', async () => {
    renderAdmin('/', withClasses());
    const bar = await menu();
    expect(within(bar).getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
    expect(within(bar).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('button', { name: 'Clase' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(bar).getByRole('button', { name: 'De făcut' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a new page at the top', async () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    renderAdmin('/', withClasses(), <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: /contul tău/ }));
    scroll.mockClear();
    await userEvent.click(screen.getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    expect(scroll).toHaveBeenCalledWith(0, 0);
  });

  it('leaves the place on Back to the browser', async () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    renderAdmin('/', withClasses(), withBack);
    await userEvent.click(await screen.findByRole('button', { name: /contul tău/ }));
    await userEvent.click(screen.getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    scroll.mockClear();
    await back();
    await expectLocation(/^\/$/);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('keeps the scroll for a replaced address and for a new hash', async () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    renderAdmin(
      '/',
      withClasses(),
      <>
        <LocationProbe />
        <MoveButtons />
      </>,
    );
    await screen.findByRole('button', { name: /contul tău/ });
    scroll.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Înlocuiește adresa' }));
    await expectLocation('/cont');
    await userEvent.click(screen.getByRole('button', { name: 'Alt hash' }));
    await expectLocation('/cont');
    expect(scroll).not.toHaveBeenCalled();
  });

  it('opens the account menu from the initials, with Contul meu', async () => {
    renderAdmin('/', withClasses(), <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'LM, contul tău: Laura Miron' }));
    expect(screen.getByText('profesor@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    // The new page closes the menu (Contul meu shows the email on its own).
    expect(screen.getByRole('button', { name: 'LM, contul tău: Laura Miron' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('user-menu')).toBeNull();
  });

  it('logs out from the account menu', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
    const api = withClasses();
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: /contul tău/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Ieși din cont' }));
    expect(api.logout).toHaveBeenCalled();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/teacher/'));
    vi.restoreAllMocks();
  });

  it('closes the account menu on Esc and on a click outside it', async () => {
    renderAdmin('/', withClasses());
    const button = await screen.findByRole('button', { name: /contul tău/ });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('main'));
    expect(screen.queryByRole('link', { name: 'Contul meu' })).not.toBeInTheDocument();
  });

  it('gives the focus back to the initials when Esc closes the account menu', async () => {
    renderAdmin('/', withClasses());
    const button = await screen.findByRole('button', { name: /contul tău/ });
    await userEvent.click(button);
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Contul meu' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveFocus();
  });

  it('keeps the account menu closed on Back to the page it was opened on', async () => {
    renderAdmin('/', withClasses(), withBack);
    await userEvent.click(await screen.findByRole('button', { name: /contul tău/ }));
    await userEvent.click(screen.getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    await back();
    await expectLocation(/^\/$/);
    expect(screen.getByRole('button', { name: /contul tău/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('profesor@example.com')).not.toBeInTheDocument();
  });

  it('names the account button with the initials it shows first', async () => {
    renderAdmin('/', withClasses());
    const button = await screen.findByRole('button', { name: /contul tău/ });
    expect(button).toHaveTextContent('LM');
    expect(button).toHaveAccessibleName('LM, contul tău: Laura Miron');
  });

  it('closes only the account menu on Esc when a panel is open too', async () => {
    renderAdmin('/', withClasses());
    const bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    const account = screen.getByRole('button', { name: /contul tău/ });
    await userEvent.click(account);
    await userEvent.keyboard('{Escape}');
    expect(account).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('complementary', { name: 'Clasele tale' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('closes only the QR view on Esc when a panel is open too', async () => {
    renderAdmin('/teste/6E2-26T2', withClasses());
    const bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
    expect(screen.getByRole('dialog', { name: 'Codul QR pentru elevi' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Codul QR pentru elevi' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Clasele tale' })).toBeInTheDocument();
  });
});

describe('the phone menu', () => {
  it('opens from ☰ with Setări, the school year, the theme and the account', async () => {
    renderAdmin('/', withClasses());
    await menu();
    const burger = screen.getByRole('button', { name: 'Mai mult' });
    // ☰ is named for its menu, apart from the bar "Meniu".
    expect(screen.queryByRole('button', { name: 'Meniu' })).not.toBeInTheDocument();
    await userEvent.click(burger);
    expect(burger).toHaveAttribute('aria-expanded', 'true');
    const more = screen.getByRole('region', { name: 'Mai mult' });
    expect(within(more).getByRole('link', { name: 'Setări' })).toHaveAttribute('href', '/setari');
    expect(within(more).getByLabelText('Anul școlar')).toHaveValue('2026');
    expect(within(more).getByText('profesor@example.com')).toBeInTheDocument();
    expect(within(more).getByRole('link', { name: 'Contul meu' })).toHaveAttribute('href', '/cont');
    expect(within(more).getByRole('button', { name: 'Ieși din cont' })).toBeInTheDocument();

    await userEvent.click(within(more).getByRole('switch', { name: 'Temă întunecată' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Temă luminoasă' })).toBeInTheDocument();
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('shows a demo account its papers in ☰, and only to a demo account', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 20 }) }));
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    const more = screen.getByRole('region', { name: 'Mai mult' });
    expect(within(more).getByText('Cont demo')).toBeInTheDocument();
    expect(within(more).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('20 din 35');
    expect(more).toHaveTextContent('Mai ai 15 lucrări, pentru testul tău.');
    cleanup();

    renderAdmin('/', withClasses());
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    expect(within(screen.getByRole('region', { name: 'Mai mult' })).queryByText('Cont demo')).not.toBeInTheDocument();
  });

  it('changes the school year for every page', async () => {
    const api = withClasses();
    renderAdmin('/', api);
    await menu();
    expect(await within(screen.getByRole('main')).findByRole('link', { name: 'Ecuații' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    await userEvent.selectOptions(within(screen.getByRole('region', { name: 'Mai mult' })).getByLabelText('Anul școlar'), '2027');
    // The Teste page shows the tests of the new year: none.
    await vi.waitFor(() => expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Ecuații' })).not.toBeInTheDocument());
    expect(api.listTests).toHaveBeenCalledWith(2027);
  });

  it('shows no Setări to a teacher', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    expect(within(screen.getByRole('region', { name: 'Mai mult' })).queryByRole('link', { name: 'Setări' })).not.toBeInTheDocument();
  });

  it('closes on ☰, on Esc, on a tap outside it, on a page, and when a panel opens', async () => {
    renderAdmin('/', withClasses(), <LocationProbe />);
    const bar = await menu();
    const burger = screen.getByRole('button', { name: 'Mai mult' });
    const isOpen = () => screen.queryByRole('region', { name: 'Mai mult' }) !== null;
    await userEvent.click(burger);
    await userEvent.click(burger);
    expect(isOpen()).toBe(false);
    await userEvent.click(burger);
    await userEvent.keyboard('{Escape}');
    expect(isOpen()).toBe(false);
    await userEvent.click(burger);
    await userEvent.click(screen.getByRole('main'));
    expect(isOpen()).toBe(false);
    await userEvent.click(burger);
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(isOpen()).toBe(false);
    await userEvent.click(burger);
    await userEvent.click(within(screen.getByRole('region', { name: 'Mai mult' })).getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    expect(isOpen()).toBe(false);
  });

  it('comes right after ☰ for the keyboard, and Esc gives the focus back to ☰', async () => {
    renderAdmin('/', withClasses());
    await menu();
    const burger = screen.getByRole('button', { name: 'Mai mult' });
    await userEvent.click(burger);
    await userEvent.tab();
    expect(within(screen.getByRole('region', { name: 'Mai mult' })).getByRole('link', { name: 'Setări' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Mai mult' })).not.toBeInTheDocument();
    expect(burger).toHaveFocus();
  });

  it('stays closed on Back to the page it was opened on', async () => {
    renderAdmin('/', withClasses(), withBack);
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    await userEvent.click(within(screen.getByRole('region', { name: 'Mai mult' })).getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    await back();
    await expectLocation(/^\/$/);
    expect(screen.queryByRole('region', { name: 'Mai mult' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mai mult' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('De făcut', () => {
  it('shows in the bar how many things wait', async () => {
    renderAdmin('/', withTodo());
    expect(await within(await menu()).findByRole('button', { name: 'De făcut: 3 lucruri' })).toHaveTextContent('De făcut3');
  });

  it('lists the three things in its panel, each with a button to its test', async () => {
    renderAdmin('/', withTodo(), <LocationProbe />);
    await userEvent.click(await within(await menu()).findByRole('button', { name: /^De făcut/ }));
    const panel = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    const cards = within(panel).getAllByRole('listitem');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Verifică baremul generat',
      'Decide 3 puncte nesigure',
      'Publică rezultatele',
    ]);
    expect(cards[0]).toHaveTextContent('PregătireInducție · 6E3');
    expect(within(panel).getByText('Celălalt test în lucru nu are nevoie de tine acum.')).toBeInTheDocument();
    expect(within(cards[0]!).getByRole('link')).toHaveAttribute('href', expect.not.stringContaining('verificare'));
    const start = within(cards[1]!).getByRole('link', { name: 'Începe: Ecuații, 6E2' });
    expect(start).toHaveAttribute('href', '/teste/6E2-26T2/verificare');
    await userEvent.click(start);
    await expectLocation('/teste/6E2-26T2/verificare');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('puts an urgent card first for an administrator when accounts wait for approval', async () => {
    const api = createFakeApi({
      classes: [],
      students: {},
      accounts: [
        fakeAccount(),
        fakeAccount({ id: 7, name: 'Nou Unu', email: 'unu@example.com', status: 'pending' }),
        fakeAccount({ id: 8, name: 'Nou Doi', email: 'doi@example.com', status: 'pending' }),
      ],
    });
    renderAdmin('/', api, <LocationProbe />);
    const button = await within(await menu()).findByRole('button', { name: 'De făcut: 1 lucru, unul urgent' });
    expect(button).toHaveTextContent('De făcut1');
    await userEvent.click(button);
    const panel = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    const card = within(panel).getAllByRole('listitem')[0]!;
    expect(card).toHaveTextContent('Urgent');
    expect(within(card).getByRole('heading')).toHaveTextContent('2 conturi noi așteaptă aprobarea');
    await userEvent.click(within(card).getByRole('link', { name: /Setări/ }));
    await expectLocation('/setari');
  });

  it('says one account in the singular, and counts it with the tests that wait', async () => {
    const api = createFakeApi({
      students: {},
      accounts: [fakeAccount(), fakeAccount({ id: 7, status: 'pending' })],
      tests: [fakeTest({ code: '6E2-26T3', title: 'Logaritmi', status: 'done', gradedCount: 20 })],
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    });
    renderAdmin('/', api);
    await userEvent.click(await within(await menu()).findByRole('button', { name: /^De făcut/ }));
    const panel = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    const cards = within(panel).getAllByRole('listitem');
    expect(within(cards[0]!).getByRole('heading')).toHaveTextContent('Un cont nou așteaptă aprobarea');
    expect(cards).toHaveLength(2);
  });

  it('shows no account card to a teacher, and asks for no accounts', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) });
    renderAdmin('/', api);
    await within(await menu()).findByRole('button', { name: 'De făcut' });
    expect(api.listAccounts).not.toHaveBeenCalled();
  });

  it('reads the tests of the year again after a change, and when the version changed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = withTodo();
    renderAdmin('/cont', api);
    await userEvent.type(await screen.findByLabelText('Parola de acum'), 'parola-veche');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    expect(api.listTests).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    await vi.waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(2));
    api.dataVersion.mockResolvedValue('changed');
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await vi.waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(3));
  });

  it('says so when nothing waits, and names the tests in work without "other"', async () => {
    renderAdmin('/', withClasses({ files }));
    await userEvent.click(await within(await menu()).findByRole('button', { name: 'De făcut' }));
    const panel = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    expect(within(panel).getByRole('heading', { level: 3, name: 'Nimic nu te așteaptă acum' })).toBeInTheDocument();
    // The fake teacher is an administrator: a new account would wait here too.
    expect(panel).toHaveTextContent('Când un barem, un punct nesigur, niște rezultate sau un cont nou au nevoie de tine, apar aici.');
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    expect(await within(panel).findByText('Testul în lucru nu are nevoie de tine acum.')).toBeInTheDocument();
  });

  it('names no accounts in the empty sentence for a teacher who is not an administrator', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await userEvent.click(await within(await menu()).findByRole('button', { name: 'De făcut' }));
    const panel = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    expect(await within(panel).findByRole('heading', { level: 3, name: 'Nimic nu te așteaptă acum' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('Când un barem, un punct nesigur sau niște rezultate au nevoie de tine, apar aici.');
    expect(panel).not.toHaveTextContent('cont nou');
  });

  it('counts several tests in work when nothing waits', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
        students: {},
        tests: [fakeTest({ code: '6E2-26T2', status: 'open', files }), fakeTest({ code: '6E2-26T1', status: 'draft', files })],
      }),
    );
    await userEvent.click(await within(await menu()).findByRole('button', { name: 'De făcut' }));
    expect(await screen.findByText('Cele 2 teste în lucru nu au nevoie de tine acum.')).toBeInTheDocument();
  });

  it('is open alone: Clase closes it, and it closes Clase', async () => {
    renderAdmin('/', withTodo());
    const bar = await menu();
    await userEvent.click(await within(bar).findByRole('button', { name: /^De făcut/ }));
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(screen.getAllByRole('complementary').map((panel) => panel.getAttribute('aria-labelledby'))).toEqual(['panel-clase-title']);
    await userEvent.click(within(bar).getByRole('button', { name: /^De făcut/ }));
    expect(screen.getAllByRole('complementary').map((panel) => panel.getAttribute('aria-labelledby'))).toEqual(['panel-todo-title']);
  });

  it('gives the focus back to the button of the panel Esc closes, also after a switch of panels', async () => {
    renderAdmin('/', withTodo());
    const bar = await menu();
    const todo = await within(bar).findByRole('button', { name: /^De făcut/ });
    const clase = within(bar).getByRole('button', { name: 'Clase' });
    await userEvent.click(clase);
    await userEvent.keyboard('{Escape}');
    expect(clase).toHaveFocus();
    await userEvent.click(clase);
    await userEvent.click(todo);
    expect(screen.getByRole('complementary', { name: 'Ce ai de făcut' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(todo).toHaveFocus();
  });
});

describe('the panel Clasele tale', () => {
  it('opens from Clase with the classes of the year and their tests in work', async () => {
    renderAdmin('/', withClasses());
    const clase = within(await menu()).getByRole('button', { name: 'Clase' });
    await userEvent.click(clase);
    expect(clase).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('complementary', { name: 'Clasele tale' });
    // The panel's title names it; the list inside needs no second name.
    const list = within(panel).getByRole('navigation');
    expect(list).not.toHaveAttribute('aria-label');
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/clase/1', '/clase/2']);
    // The open test misses its files: they wait on the teacher.
    expect(links[0]).toHaveTextContent('6E21 elevEcuații · Pregătire · lipsesc testul și baremul');
    expect(links[1]).toHaveTextContent('Nimic în lucru');
    expect(within(panel).getByRole('link', { name: '+ Clasă nouă' })).toHaveAttribute('href', '/clase');
    expect(within(panel).getByRole('link', { name: 'Arhivate (1)' })).toHaveAttribute('href', '/clase');
    expect(within(panel).getByRole('button', { name: 'Închide' })).toHaveFocus();
  });

  it('opens the archived classes from "Arhivate (n)"', async () => {
    renderAdmin('/', withClasses());
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    const panel = screen.getByRole('complementary', { name: 'Clasele tale' });
    await userEvent.click(within(panel).getByRole('link', { name: 'Arhivate (1)' }));
    expect(await screen.findByRole('group', { name: 'Arhivate' })).toBeInTheDocument();
  });

  it('opens "Clasă nouă" from its link', async () => {
    renderAdmin('/', withClasses());
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    const panel = screen.getByRole('complementary', { name: 'Clasele tale' });
    await userEvent.click(within(panel).getByRole('link', { name: '+ Clasă nouă' }));
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });

  it('opens a class, closes, and marks Clase on the class page', async () => {
    renderAdmin('/', withClasses(), <LocationProbe />);
    const bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    await userEvent.click(screen.getByRole('link', { name: /^6E3/ }));
    await expectLocation('/clase/2');
    expect(screen.queryByRole('complementary', { name: 'Clasele tale' })).not.toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Clase' })).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('link', { name: 'Teste' })).not.toHaveAttribute('aria-current');

    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(screen.getByRole('link', { name: /^6E3/ })).toHaveAttribute('aria-current', 'page');
  });

  it('closes on ×, on Esc and on Clase again, and gives the focus back', async () => {
    renderAdmin('/', withClasses());
    const clase = within(await menu()).getByRole('button', { name: 'Clase' });
    await userEvent.click(clase);
    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(clase).toHaveFocus();
    await userEvent.click(clase);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await userEvent.click(clase);
    await userEvent.click(clase);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('comes right after the bar for the keyboard', async () => {
    renderAdmin('/', withClasses());
    const bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(screen.getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(bar).toContainElement(document.activeElement as HTMLElement);
  });

  it('makes the page under it unreachable on a phone, and only there', async () => {
    renderAdmin('/', withClasses());
    let bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(document.querySelector('main')).not.toHaveAttribute('inert');
    await userEvent.keyboard('{Escape}');
    cleanup();

    onPhone();
    renderAdmin('/', withClasses());
    bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    expect(document.querySelector('main')).toHaveAttribute('inert');
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('main')).not.toHaveAttribute('inert');
  });

  it('stays closed on Back to the page it was opened on', async () => {
    renderAdmin('/', withClasses(), withBack);
    const bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    await userEvent.click(screen.getByRole('link', { name: /^6E3/ }));
    await expectLocation('/clase/2');
    await back();
    await expectLocation(/^\/$/);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Clase' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('says what waits in a test, in orange', async () => {
    renderAdmin('/', withTodo());
    const bar = await menu();
    await within(bar).findByRole('button', { name: /^De făcut: / });
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    const list = within(screen.getByRole('complementary', { name: 'Clasele tale' })).getByRole('navigation');
    const first = within(list).getByRole('link', { name: /^6E2/ });
    expect(Array.from(first.querySelectorAll('.class-item-test')).map((line) => [line.textContent, line.className])).toEqual([
      ['Logaritmi · Rezultate · nepublicate', 'class-item-test is-waiting'],
      ['Ecuații · Verificare · 3 puncte nesigure', 'class-item-test is-waiting'],
    ]);
    expect(within(list).getByRole('link', { name: /^6E3/ })).toHaveTextContent('Inducție · Pregătire · baremul de verificatMulțimi · Deschis');
  });

  it('says so when the year has no class, with one "Clasă nouă"', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher() }));
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    const panel = screen.getByRole('complementary', { name: 'Clasele tale' });
    expect(within(panel).getByRole('heading', { level: 3, name: 'Încă nu ai nicio clasă' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('Adaugă clasa cu numele elevilor, câte unul pe rând.');
    expect(within(panel).getAllByRole('link', { name: '+ Clasă nouă' })).toHaveLength(1);
    await userEvent.click(within(panel).getByRole('link', { name: '+ Clasă nouă' }));
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });

  it('keeps the way to the archived classes when the year has only those', async () => {
    const api = createFakeApi({ classes: [{ id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 }], students: {}, me: fakeTeacher() });
    renderAdmin('/', api);
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    const panel = screen.getByRole('complementary', { name: 'Clasele tale' });
    expect(await within(panel).findByRole('heading', { name: 'Nu ai nicio clasă activă' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Arhivate (1)' })).toBeInTheDocument();
    expect(within(panel).getAllByRole('link', { name: '+ Clasă nouă' })).toHaveLength(1);
  });
});

describe('the panels before the tests of the year arrive', () => {
  it('say the list is loading, not that nothing waits', async () => {
    const api = withClasses();
    api.listTests.mockImplementation(() => new Promise(() => {}));
    renderAdmin('/cont', api);
    const bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'De făcut' }));
    const todo = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    expect(within(todo).getByText('Se încarcă…')).toBeInTheDocument();
    expect(within(todo).queryByRole('heading', { name: 'Nimic nu te așteaptă acum' })).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    const classes = screen.getByRole('complementary', { name: 'Clasele tale' });
    expect(await within(classes).findByRole('link', { name: /^6E2/ })).not.toHaveTextContent('Nimic în lucru');
  });

  it('show why the list could not be read', async () => {
    const api = withClasses();
    api.listTests.mockRejectedValue(new ApiError(500, 'server_error', 'Serverul nu răspunde acum.'));
    renderAdmin('/cont', api);
    const bar = await menu();
    await userEvent.click(within(bar).getByRole('button', { name: 'De făcut' }));
    const todo = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    expect(await within(todo).findByText('Serverul nu răspunde acum.')).toBeInTheDocument();
    expect(within(todo).queryByRole('heading', { name: 'Nimic nu te așteaptă acum' })).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Clase' }));
    const classes = screen.getByRole('complementary', { name: 'Clasele tale' });
    expect(await within(classes).findByText('Serverul nu răspunde acum.')).toBeInTheDocument();
    expect(within(classes).getByRole('link', { name: /^6E2/ })).not.toHaveTextContent('Nimic în lucru');
  });
});
