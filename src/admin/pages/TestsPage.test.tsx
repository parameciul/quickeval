import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const withTests = () =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'submitted', submissionId: 5 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
      ]),
      fakeTest({ code: '6E2-26T1', title: 'Fracții' }),
      fakeTest({ code: '6E2-27T1', title: 'Anul viitor', schoolYear: 2027 }),
    ],
  });

describe('TestsPage', () => {
  it('is the start page and lists the tests of the selected school year', async () => {
    const api = withTests();
    renderAdmin('/', api);
    expect(await screen.findByRole('heading', { name: 'Teste 2026-2027' })).toBeInTheDocument();
    const card = (await screen.findByRole('link', { name: '6E2-26T2' })).closest('li')!;
    expect(within(card).getByText('Ecuații')).toBeInTheDocument();
    expect(within(card).getByText('Clasa 6E2 · 6 oct. 2026, 10:15')).toBeInTheDocument();
    expect(within(card).getByText('Deschis')).toBeInTheDocument();
    expect(within(card).getByText('Trimise: 1 din 2')).toBeInTheDocument();

    const draft = screen.getByRole('link', { name: '6E2-26T1' }).closest('li')!;
    expect(within(draft).getByText('Ciornă')).toBeInTheDocument();
    expect(within(draft).queryByText(/Trimise/)).not.toBeInTheDocument();
    expect(screen.queryByText('Anul viitor')).not.toBeInTheDocument();
    expect(api.listTests).toHaveBeenCalledWith(2026);
  });

  it('links each test to its page and offers a new test', async () => {
    renderAdmin('/', withTests());
    expect(await screen.findByRole('link', { name: '6E2-26T2' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(screen.getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });

  it('says so when the year has no tests', async () => {
    renderAdmin('/', createFakeApi());
    expect(await screen.findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
  });

  it('marks Teste in the menu on test pages and Clase on class pages', async () => {
    renderAdmin('/', withTests());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(menu).getByRole('link', { name: 'Clase' }));
    expect(within(menu).getByRole('link', { name: 'Clase' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: 'Teste' })).not.toHaveAttribute('aria-current');
  });
});
