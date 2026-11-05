import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTeacher, fakeTest } from '../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../test/renderAdmin.tsx';

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
const back = () => userEvent.click(screen.getByRole('button', { name: 'Înapoi în istoric' }));

const withClasses = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 3, name: '5A', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true }] },
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open' }),
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
      fakeTest({ code: '6E3-26T1', title: 'Inducție', classId: 2, className: '6E3', barem: { request: 'none', unchecked: true } }),
      fakeTest({ code: '6E3-26T2', title: 'Mulțimi', classId: 2, className: '6E3', status: 'open' }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', gradedCount: 20, resultsOpen: true }),
    ],
  });

const menu = () => screen.findByRole('navigation', { name: 'Meniu' });

afterEach(() => {
  vi.useRealTimers();
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

  it('opens the account menu from the initials, with Contul meu', async () => {
    renderAdmin('/', withClasses(), <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Contul tău: Laura Miron' }));
    expect(screen.getByText('profesor@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    expect(screen.queryByText('profesor@example.com')).not.toBeInTheDocument();
  });

  it('logs out from the account menu', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
    const api = withClasses();
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: /^Contul tău/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Ieși din cont' }));
    expect(api.logout).toHaveBeenCalled();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/'));
    vi.restoreAllMocks();
  });

  it('closes the account menu on Esc and on a click outside it', async () => {
    renderAdmin('/', withClasses());
    const button = await screen.findByRole('button', { name: /^Contul tău/ });
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
    const button = await screen.findByRole('button', { name: /^Contul tău/ });
    await userEvent.click(button);
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Contul meu' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveFocus();
  });

  it('keeps the account menu closed on Back to the page it was opened on', async () => {
    renderAdmin('/', withClasses(), withBack);
    await userEvent.click(await screen.findByRole('button', { name: /^Contul tău/ }));
    await userEvent.click(screen.getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    await back();
    await expectLocation(/^\/$/);
    expect(screen.getByRole('button', { name: /^Contul tău/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('profesor@example.com')).not.toBeInTheDocument();
  });
});

describe('the phone menu', () => {
  it('opens from ☰ with Setări, the school year, the theme and the account', async () => {
    renderAdmin('/', withClasses());
    await menu();
    const burger = screen.getByRole('button', { name: 'Meniu' });
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

  it('changes the school year for every page', async () => {
    renderAdmin('/', withClasses());
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Meniu' }));
    await userEvent.selectOptions(within(screen.getByRole('region', { name: 'Mai mult' })).getByLabelText('Anul școlar'), '2027');
    expect(await screen.findByRole('heading', { name: 'Teste 2027-2028' })).toBeInTheDocument();
  });

  it('shows no Setări to a teacher', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await menu();
    await userEvent.click(screen.getByRole('button', { name: 'Meniu' }));
    expect(within(screen.getByRole('region', { name: 'Mai mult' })).queryByRole('link', { name: 'Setări' })).not.toBeInTheDocument();
  });

  it('closes on ☰, on Esc, on a tap outside it, on a page, and when a panel opens', async () => {
    renderAdmin('/', withClasses(), <LocationProbe />);
    const bar = await menu();
    const burger = screen.getByRole('button', { name: 'Meniu' });
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
    const burger = screen.getByRole('button', { name: 'Meniu' });
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
    await userEvent.click(screen.getByRole('button', { name: 'Meniu' }));
    await userEvent.click(within(screen.getByRole('region', { name: 'Mai mult' })).getByRole('link', { name: 'Contul meu' }));
    await expectLocation('/cont');
    await back();
    await expectLocation(/^\/$/);
    expect(screen.queryByRole('region', { name: 'Mai mult' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Meniu' })).toHaveAttribute('aria-expanded', 'false');
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
    const start = within(cards[1]!).getByRole('link', { name: 'Începe: Ecuații, 6E2' });
    expect(start).toHaveAttribute('href', '/teste/6E2-26T2');
    await userEvent.click(start);
    await expectLocation('/teste/6E2-26T2');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('reads the tests of the year again after a change and every minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = withTodo();
    renderAdmin('/cont', api);
    await userEvent.type(await screen.findByLabelText('Parola de acum'), 'parola-veche');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    expect(api.listTests).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    await vi.waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(2));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(api.listTests).toHaveBeenCalledTimes(3);
  });

  it('says so when nothing waits', async () => {
    renderAdmin('/', withClasses());
    await userEvent.click(within(await menu()).getByRole('button', { name: 'De făcut' }));
    expect(screen.getByText('Nimic nu te așteaptă acum.')).toBeInTheDocument();
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
    const list = within(panel).getByRole('navigation', { name: 'Clasele tale' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/clase/1', '/clase/2']);
    expect(links[0]).toHaveTextContent('6E21 elevEcuații · Deschis');
    expect(links[1]).toHaveTextContent('Nimic în lucru');
    expect(within(panel).getByRole('link', { name: '+ Clasă nouă' })).toHaveAttribute('href', '/clase');
    expect(within(panel).getByRole('link', { name: 'Arhivate (1)' })).toHaveAttribute('href', '/clase');
    expect(within(panel).getByRole('button', { name: 'Închide' })).toHaveFocus();
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
    const list = screen.getByRole('navigation', { name: 'Clasele tale' });
    const first = within(list).getByRole('link', { name: /^6E2/ });
    expect(Array.from(first.querySelectorAll('.class-item-test')).map((line) => [line.textContent, line.className])).toEqual([
      ['Logaritmi · Rezultate · nepublicate', 'class-item-test is-waiting'],
      ['Ecuații · Verificare · 3 puncte nesigure', 'class-item-test is-waiting'],
    ]);
    expect(within(list).getByRole('link', { name: /^6E3/ })).toHaveTextContent('Inducție · Pregătire · baremul de verificatMulțimi · Deschis');
  });

  it('says so when the year has no class', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher() }));
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    expect(screen.getByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
});
