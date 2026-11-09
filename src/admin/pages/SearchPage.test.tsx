import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentRow } from '../../../shared/api.ts';
import { createFakeApi, fakeTest } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const student = (id: number, fullName: string): StudentRow => ({ id, fullName, active: true, canDelete: true, ces: false });

function searchApi() {
  const api = createFakeApi({
    classes: [
      { id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 2 },
      { id: 2, name: '9A', schoolYear: 2026, archived: false, studentCount: 2 },
      { id: 3, name: '12STE', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: {
      1: [student(10, 'Ștefan Radu'), student(11, 'Pop Ana')],
      2: [student(20, 'Ştefania Pop'), student(21, 'Ioana Stefănescu')],
    },
    tests: [
      fakeTest({ code: '9A-26T1', title: 'Teorema lui Stewart', classId: 2, className: '9A', status: 'done', resultsOpen: true, archived: true }),
      fakeTest({ code: '10B-26T1', title: 'Ștergerea fracțiilor', classId: 1, className: '10B' }),
    ],
  });
  return api;
}

async function openPage(path: string, api = searchApi()) {
  renderAdmin(path, api, <LocationProbe />);
  return screen.findByRole('heading', { level: 1 });
}

describe('the search results page', () => {
  it('shows every group the search found, with counts, the match in bold and each line a link', async () => {
    // The fake API gives no grades; the API gives the latest one.
    const api = searchApi();
    const real = api.search.getMockImplementation()!;
    api.search.mockImplementation(async (query, year) => {
      const found = await real(query, year);
      return { ...found, students: found.students.map((s) => (s.id === 10 ? { ...s, lastGrade: 7.1 } : s)) };
    });
    expect(await openPage('/cautare?q=stef', api)).toHaveTextContent('Rezultate pentru „stef”');
    expect(await screen.findByText('3 rezultate în anul școlar 2026-2027. Diacriticele nu contează.')).toBeInTheDocument();
    const chips = screen.getByRole('group', { name: 'Arată' });
    expect(within(chips).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Toate 3', 'Elevi 3', 'Clase 0', 'Teste 0']);
    expect(within(chips).getByRole('button', { name: 'Toate 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByRole('button', { name: 'Clase 0' })).toBeDisabled();

    const students = screen.getByRole('table', { name: 'Elevi' });
    const rows = within(students).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Ioana StefănescuClasa 9Anicio notă încă',
      'Ștefan RaduClasa 10Bultima notă 7,1',
      'Ştefania PopClasa 9Anicio notă încă',
    ]);
    expect(within(rows[1]!).getByRole('link', { name: 'Ștefan Radu' })).toHaveAttribute('href', '/elevi/10');
    expect(within(rows[0]!).getByText('Stef', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Clase' })).not.toBeInTheDocument();
    expect(api.search).toHaveBeenCalledWith('stef', 2026);
  });

  it('shows the classes and the tests with their state', async () => {
    await openPage('/cautare?q=ste');
    const classes = await screen.findByRole('table', { name: 'Clase' });
    expect(within(classes).getByRole('row').textContent).toBe('Clasa 12STEniciun elevarhivată');
    expect(within(classes).getByRole('link', { name: 'Clasa 12STE' })).toHaveAttribute('href', '/clase/3');
    const tests = screen.getByRole('table', { name: 'Teste' });
    expect(within(tests).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'Teorema lui StewartClasa 9A · arhivatRezultate · publicate',
      'Ștergerea fracțiilorClasa 10B · ciornăPregătire · lipsește testul',
    ]);
    expect(within(tests).getByRole('link', { name: 'Teorema lui Stewart' })).toHaveAttribute('href', '/teste/9A-26T1');
  });

  it('shows one group with its chip, kept in the address', async () => {
    await openPage('/cautare?q=ste');
    await screen.findByRole('table', { name: 'Clase' });
    await userEvent.click(screen.getByRole('button', { name: 'Teste 2' }));
    await expectLocation('/cautare?q=ste&arata=teste');
    expect(screen.getByRole('button', { name: 'Teste 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('table', { name: 'Teste' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Elevi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Clase' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toate 6' }));
    await expectLocation('/cautare?q=ste');
    expect(screen.getByRole('table', { name: 'Elevi' })).toBeInTheDocument();
  });

  it('shows every group for a chip of an empty group in the address', async () => {
    await openPage('/cautare?q=stef&arata=clase');
    expect(await screen.findByRole('table', { name: 'Elevi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toate 3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no old results under a new search', async () => {
    const api = searchApi();
    renderAdmin('/', api, <LocationProbe />);
    await screen.findByRole('navigation', { name: 'Meniu' });
    const box = screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' });
    await userEvent.type(box, 'stef{Enter}');
    expect(await screen.findByRole('table', { name: 'Elevi' })).toBeInTheDocument();
    const real = api.search.getMockImplementation()!;
    let answer = () => {};
    api.search.mockImplementation((query, year) => new Promise((resolve) => (answer = () => resolve(real(query, year)))));
    await userEvent.clear(box);
    await userEvent.type(box, 'stew{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rezultate pentru „stew”' })).toBeInTheDocument();
    expect(screen.getByText('Se încarcă…')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Elevi' })).not.toBeInTheDocument();
    await act(async () => answer());
    expect(await screen.findByRole('table', { name: 'Teste' })).toBeInTheDocument();
  });

  it('says when it finds nothing', async () => {
    await openPage('/cautare?q=zzz');
    expect(await screen.findByText('Niciun rezultat în anul școlar 2026-2027. Diacriticele nu contează.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Arată' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('asks for two letters with no search, or a search too short', async () => {
    const api = searchApi();
    for (const path of ['/cautare', '/cautare?q=%20s%20']) {
      const { unmount } = renderAdmin(path, api);
      expect(await screen.findByRole('heading', { level: 1, name: 'Caută' })).toBeInTheDocument();
      expect(screen.getByText('Scrie cel puțin două litere în caseta de căutare.')).toBeInTheDocument();
      unmount();
    }
    expect(api.search).not.toHaveBeenCalled();
  });

  it('shows the error when the search fails', async () => {
    const api = searchApi();
    api.search.mockRejectedValue(new Error('network'));
    await openPage('/cautare?q=stef', api);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Se încarcă…')).not.toBeInTheDocument();
  });

  it('opens from the box with Enter and searches again from there', async () => {
    const api = searchApi();
    renderAdmin('/', api, <LocationProbe />);
    await screen.findByRole('navigation', { name: 'Meniu' });
    const box = screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' });
    await userEvent.type(box, 'stef{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rezultate pentru „stef”' })).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'stew{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rezultate pentru „stew”' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Teste' })).toBeInTheDocument();
  });
});
