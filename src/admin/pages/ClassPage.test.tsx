import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

// Direct jumps between class pages, as a link from one class to another would do.
function Jumps() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/clase/1')}>
        Mergi la clasa 1
      </button>
      <button type="button" onClick={() => navigate('/clase/2')}>
        Mergi la clasa 2
      </button>
    </>
  );
}

const oneClass = () =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {
      1: [
        { id: 10, fullName: 'Pop Ion', active: true },
        { id: 11, fullName: 'Ionescu Ana', active: false },
      ],
    },
  });

describe('ClassPage', () => {
  it('shows the class and its students, with students who left marked', async () => {
    renderAdmin('/clase/1', oneClass());
    expect(await screen.findByRole('heading', { name: 'Clasa 6E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Elevi (1 elev)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/elevi/10');
    const left = screen.getByText('Ionescu Ana').closest('li')!;
    expect(within(left).getByText('a plecat')).toBeInTheDocument();
  });

  it('adds pasted names, one per line, without list numbers', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const box = await screen.findByLabelText('Numele elevilor, câte unul pe rând');
    await userEvent.type(box, '1. Marin Dan{Enter}{Enter}2) Stan Eva');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă 2 elevi' }));
    expect(api.addStudents).toHaveBeenCalledWith(1, ['Marin Dan', 'Stan Eva']);
    expect(await screen.findByText('Marin Dan')).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('lists the tests of the class and offers a new one for it', async () => {
    const api = oneClass();
    await api.createTest({ classId: 1, title: 'Fracții' });
    renderAdmin('/clase/1', api);
    expect(await screen.findByRole('link', { name: '6E2-26T1 · Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByRole('link', { name: 'Test nou pentru această clasă' })).toHaveAttribute('href', '/teste/nou?clasa=1');
  });

  it('offers no new test for an archived class', async () => {
    const api = oneClass();
    await api.updateClass(1, { archived: true });
    renderAdmin('/clase/1', api);
    expect(await screen.findByText('Clasa nu are încă teste.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Test nou pentru această clasă' })).not.toBeInTheDocument();
  });

  it('marks a student as left', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'A plecat' }));
    expect(api.setStudentActive).toHaveBeenCalledWith(1, 10, false);
    expect(await within(row).findByRole('button', { name: 'Revine în clasă' })).toBeInTheDocument();
  });

  it('renames a student', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Redenumește' }));
    const input = screen.getByLabelText('Numele elevului');
    await userEvent.clear(input);
    await userEvent.type(input, 'Pop Ioan');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameStudent).toHaveBeenCalledWith(10, 'Pop Ioan');
    expect(await screen.findByText('Pop Ioan')).toBeInTheDocument();
  });

  it('renames the class', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește clasa' }));
    const input = screen.getByLabelText('Nume nou');
    await userEvent.clear(input);
    await userEvent.type(input, '6E3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { name: '6E3' });
    expect(await screen.findByRole('heading', { name: 'Clasa 6E3 · 2026-2027' })).toBeInTheDocument();
  });

  it.each(['abc', '1e3', '01'])('shows the not-found page for the class id %j', async (id) => {
    renderAdmin(`/clase/${id}`, oneClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts with an empty draft when it moves straight to another class', async () => {
    const api = createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '7E2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    });
    // Class 2 is opened first, so later its page shows at once, without a loading step.
    renderAdmin('/clase/2', api, <Jumps />);
    await screen.findByRole('heading', { name: 'Clasa 7E2 · 2026-2027' });
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 1' }));
    await userEvent.type(await screen.findByLabelText('Numele elevilor, câte unul pe rând'), 'Pop Ion');
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 2' }));
    expect(await screen.findByRole('heading', { name: 'Clasa 7E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByLabelText('Numele elevilor, câte unul pe rând')).toHaveValue('');
  });

  it('shows the server message for a class that does not exist', async () => {
    renderAdmin('/clase/999', oneClass());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
