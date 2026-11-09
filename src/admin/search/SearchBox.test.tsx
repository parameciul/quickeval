import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentRow } from '../../../shared/api.ts';
import { createFakeApi, fakeTest } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const student = (id: number, fullName: string): StudentRow => ({ id, fullName, active: true, canDelete: true, ces: false });

function searchApi() {
  return createFakeApi({
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
      fakeTest({ code: '10B-26T1', title: 'Ștergerea fracțiilor', classId: 1, className: '10B' }),
      fakeTest({ code: '9A-26T1', title: 'Teorema lui Stewart', classId: 2, className: '9A' }),
    ],
  });
}

async function openSearch(api = searchApi()) {
  const { queryClient } = renderAdmin('/', api, <LocationProbe />);
  await screen.findByRole('navigation', { name: 'Meniu' });
  return Object.assign(screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' }), { queryClient });
}

describe('the search box', () => {
  it('lists what it finds under the box, grouped, with the match in bold and the results page last', async () => {
    const api = searchApi();
    const box = await openSearch(api);
    await userEvent.type(box, 's');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await userEvent.type(box, 'tef');
    const list = await screen.findByRole('listbox', { name: 'Rezultate pentru „stef”' });
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(box).toHaveAttribute('aria-controls', list.id);
    const students = await within(list).findByRole('group', { name: 'Elevi' });
    expect(within(students).getAllByRole('option')).toHaveLength(3);
    expect(within(students).getByRole('option', { name: 'Ștefan Radu, Clasa 10B' })).toBeInTheDocument();
    expect(within(students).getByRole('option', { name: 'Ioana Stefănescu, Clasa 9A' }).querySelector('mark')).toHaveTextContent('Stef');
    expect(within(students).getByRole('option', { name: 'Ştefania Pop, Clasa 9A' }).querySelector('mark')).toHaveTextContent('Ştef');
    expect(within(list).queryByRole('group', { name: 'Clase' })).not.toBeInTheDocument();
    expect(within(list).queryByRole('group', { name: 'Teste' })).not.toBeInTheDocument();
    const options = within(list).getAllByRole('option');
    expect(options[options.length - 1]).toHaveAccessibleName('Toate rezultatele pentru „stef”');
    expect(api.search).toHaveBeenLastCalledWith('stef', 2026);

    await userEvent.clear(box);
    await userEvent.type(box, 'ste');
    const next = await screen.findByRole('listbox', { name: 'Rezultate pentru „ste”' });
    expect(await within(next).findByRole('option', { name: 'Clasa 12STE, niciun elev · arhivată' })).toBeInTheDocument();
    const tests = within(next).getByRole('group', { name: 'Teste' });
    expect(within(tests).getByRole('option', { name: 'Teorema lui Stewart, Clasa 9A · ciornă' })).toBeInTheDocument();
  });

  it('asks the API once the typing stops', async () => {
    const api = searchApi();
    const box = await openSearch(api);
    await userEvent.type(box, 'stefan');
    await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' });
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(api.search).toHaveBeenCalledWith('stefan', 2026);
  });

  it('moves with the arrows and opens the chosen line with Enter', async () => {
    const box = await openSearch();
    await userEvent.type(box, 'stef');
    const first = await screen.findByRole('option', { name: 'Ioana Stefănescu, Clasa 9A' });
    await userEvent.keyboard('{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', first.id);
    expect(first).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}');
    const all = screen.getByRole('option', { name: 'Toate rezultatele pentru „stef”' });
    expect(box).toHaveAttribute('aria-activedescendant', all.id);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Ștefan Radu, Clasa 10B' }).id);
    await userEvent.keyboard('{Enter}');
    await expectLocation('/elevi/10');
    expect(box).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the results page with Enter when no line is chosen, and keeps the search in the box', async () => {
    const box = await openSearch();
    await userEvent.type(box, ' stef {Enter}');
    await expectLocation('/cautare?q=stef');
    expect(box).toHaveValue(' stef ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens a line with a click', async () => {
    const box = await openSearch();
    await userEvent.type(box, 'stew');
    await userEvent.click(await screen.findByRole('option', { name: 'Teorema lui Stewart, Clasa 9A · ciornă' }));
    await expectLocation('/teste/9A-26T1');
  });

  it('opens no list before the first answer', async () => {
    const api = searchApi();
    let answer: (value: Awaited<ReturnType<typeof api.search>>) => void = () => {};
    api.search.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const box = await openSearch(api);
    await userEvent.type(box, 'stef');
    await waitFor(() => expect(api.search).toHaveBeenCalled());
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.search-pop')).toBeNull();
    await act(async () => answer({ students: [], classes: [], tests: [] }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nimic găsit în acest an școlar.');
    expect(box).toHaveAttribute('aria-expanded', 'false');
  });

  it('forgets the chosen line when a new answer comes', async () => {
    const api = searchApi();
    const box = await openSearch(api);
    await userEvent.type(box, 'stef');
    await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' });
    const real = api.search.getMockImplementation()!;
    let answer = () => {};
    api.search.mockImplementation((query, year) => new Promise((resolve) => (answer = () => resolve(real(query, year)))));
    // A line chosen from the older answer, while the new one is on its way.
    await userEvent.type(box, 'a');
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith('stefa', 2026));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant');
    await act(async () => answer());
    await waitFor(() => expect(box).not.toHaveAttribute('aria-activedescendant'));
    expect(screen.getByRole('option', { name: 'Ștefan Radu, Clasa 10B' })).toHaveAttribute('aria-selected', 'false');
  });

  it('says when it finds nothing, with no line to choose', async () => {
    const box = await openSearch();
    await userEvent.type(box, 'zzz');
    expect(await screen.findByText('Nimic găsit în acest an școlar.')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).not.toHaveAttribute('aria-controls');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expectLocation('/cautare?q=zzz');
  });

  it('searches again after a change the teacher made', async () => {
    const api = searchApi();
    const box = await openSearch(api);
    await userEvent.type(box, 'stef');
    await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' });
    await api.renameStudent(10, 'Ștefan Radu-Pop');
    await act(() => box.queryClient.getMutationCache().build(box.queryClient, { mutationFn: async () => {} }).execute(undefined));
    expect(await screen.findByRole('option', { name: 'Ștefan Radu-Pop, Clasa 10B' })).toBeInTheDocument();
  });

  it('shows at most five of a group', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 7 }],
      students: { 1: Array.from({ length: 7 }, (_, index) => student(index + 1, `Ana ${String.fromCharCode(65 + index)}`)) },
    });
    const box = await openSearch(api);
    await userEvent.type(box, 'ana');
    const students = await screen.findByRole('group', { name: 'Elevi' });
    expect(within(students).getAllByRole('option')).toHaveLength(5);
  });

  it('closes the list with Esc before a panel closes', async () => {
    const box = await openSearch();
    await userEvent.click(screen.getByRole('button', { name: 'Clase' }));
    expect(screen.getByRole('complementary', { name: 'Clasele tale' })).toBeInTheDocument();
    await userEvent.type(box, 'stef');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Clasele tale' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Clasele tale' })).not.toBeInTheDocument();
  });

  it('closes the list when the focus leaves the box, and opens it again on focus', async () => {
    const box = await openSearch();
    await userEvent.type(box, 'stef');
    await screen.findByRole('listbox');
    await userEvent.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.click(box);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });
});
