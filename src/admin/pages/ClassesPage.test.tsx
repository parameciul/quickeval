import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const twoClasses = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
      { id: 3, name: '5A', schoolYear: 2027, archived: false, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true }] },
  });

describe('ClassesPage', () => {
  it('opens on the classes of the selected school year', async () => {
    const api = twoClasses();
    renderAdmin('/', api);
    expect(await screen.findByRole('heading', { name: 'Clase 2026-2027' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByText('1 elev')).toBeInTheDocument();
    expect(screen.getByText('Arhivată')).toBeInTheDocument();
    expect(screen.queryByText('Clasa 5A')).not.toBeInTheDocument();
    expect(api.listClasses).toHaveBeenCalledWith(2026);
  });

  it('shows the teacher name in the footer', async () => {
    renderAdmin('/clase', twoClasses());
    expect(await screen.findByText('QuickEval · Laura Miron')).toBeInTheDocument();
  });

  it('switches the school year from the header', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    await screen.findByRole('heading', { name: 'Clase 2026-2027' });
    await userEvent.selectOptions(screen.getByLabelText('Anul școlar'), '2027');
    expect(await screen.findByRole('heading', { name: 'Clase 2027-2028' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Clasa 5A' })).toBeInTheDocument();
  });

  it('adds a class in the selected school year', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    await userEvent.type(await screen.findByLabelText('Clasă nouă'), '7e2');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă clasa' }));
    expect(api.createClass).toHaveBeenCalledWith({ name: '7e2', schoolYear: 2026 });
    expect(await screen.findByRole('link', { name: 'Clasa 7E2' })).toBeInTheDocument();
    expect(screen.getByLabelText('Clasă nouă')).toHaveValue('');
  });

  it('shows the server message when the class already exists', async () => {
    const api = twoClasses();
    api.createClass.mockRejectedValueOnce(
      new ApiError(409, 'class_exists', 'Clasa 6E2 există deja în anul școlar 2026-2027.'),
    );
    renderAdmin('/clase', api);
    await userEvent.type(await screen.findByLabelText('Clasă nouă'), '6E2');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă clasa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clasa 6E2 există deja în anul școlar 2026-2027.');
  });

  it('archives a class and brings it back', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    const card = (await screen.findByRole('link', { name: 'Clasa 6E2' })).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Arhivează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { archived: true });
    expect(await within(card).findByRole('button', { name: 'Scoate din arhivă' })).toBeInTheDocument();
  });

  it('says so when the year has no classes', async () => {
    renderAdmin('/clase', createFakeApi());
    expect(await screen.findByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
});
