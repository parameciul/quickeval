import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

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

  it('shows the not-found page for a bad class id', async () => {
    renderAdmin('/clase/abc', oneClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the server message for a class that does not exist', async () => {
    renderAdmin('/clase/999', oneClass());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
