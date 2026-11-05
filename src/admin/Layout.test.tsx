import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTeacher, fakeTest } from '../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../test/renderAdmin.tsx';

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

const menu = () => screen.findByRole('navigation', { name: 'Meniu' });

describe('the shell', () => {
  it('shows the lockup in the top bar, and no footer', async () => {
    renderAdmin('/', withClasses());
    await menu();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(banner).toHaveTextContent('MQGraderby Laura Miron');
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('has Test nou, Teste and Clase in the bar', async () => {
    renderAdmin('/', withClasses());
    const bar = await menu();
    expect(within(bar).getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
    expect(within(bar).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('button', { name: 'Clase' })).toHaveAttribute('aria-expanded', 'false');
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

  it('says so when the year has no class', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher() }));
    await userEvent.click(within(await menu()).getByRole('button', { name: 'Clase' }));
    expect(screen.getByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
});
