import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_TEMPORARY_PASSWORD, fakeAccount } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const laura = fakeAccount();
const ana = fakeAccount({ id: 2, name: 'Ana Pop', email: 'ana@example.com', role: 'teacher', demo: true, status: 'pending' });
const bogdan = fakeAccount({ id: 3, name: 'Bogdan', email: 'bogdan@example.com', role: 'teacher', demo: true, testsEvaluated: 2 });

const mihai = fakeAccount({ id: 4, name: 'Mihai', email: 'mihai@example.com', role: 'admin' });

const withAccounts = () =>
  createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(laura), structuredClone(bogdan), structuredClone(mihai)] });

afterEach(() => {
  vi.restoreAllMocks();
});

async function section(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name });
  return heading.nextElementSibling as HTMLElement;
}

describe('the accounts on Setări', () => {
  it('lists the accounts that wait and approves one', async () => {
    const api = withAccounts();
    renderAdmin('/setari', api);
    const waiting = await section('Așteaptă aprobarea');
    expect(within(waiting).getByText('Ana Pop (ana@example.com)')).toBeInTheDocument();
    await userEvent.click(within(waiting).getByRole('button', { name: 'Aprobă Ana Pop' }));
    expect(api.approveAccount).toHaveBeenCalledWith(2, ana.createdAt);
    expect(await screen.findByText('Niciun cont nu așteaptă aprobarea.')).toBeInTheDocument();
    const teachers = await section('Profesori');
    expect(within(teachers).getByText('Ana Pop (ana@example.com)')).toBeInTheDocument();
  });

  it('refuses an account after a confirmation', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Refuză Ana Pop' }));
    expect(api.rejectAccount).toHaveBeenCalledWith(2, ana.createdAt);
    expect(await screen.findByText('Niciun cont nu așteaptă aprobarea.')).toBeInTheDocument();
  });

  it('shows the kind of each account and makes a demo account complete', async () => {
    const api = withAccounts();
    renderAdmin('/setari', api);
    const teachers = await section('Profesori');
    expect(within(teachers).getAllByText('administrator')).toHaveLength(2);
    expect(within(teachers).getByText('demo: 2 din 5 teste')).toBeInTheDocument();
    await userEvent.click(within(teachers).getByRole('button', { name: 'Fă cont complet: Bogdan' }));
    expect(api.updateAccount).toHaveBeenCalledWith(3, { demo: false });
    expect(await within(teachers).findByText('complet')).toBeInTheDocument();
  });

  it('closes an account and opens it again', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Închide contul: Bogdan' }));
    expect(api.updateAccount).toHaveBeenCalledWith(3, { status: 'disabled' });
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide contul: Bogdan' }));
    expect(api.updateAccount).toHaveBeenLastCalledWith(3, { status: 'active' });
  });

  it('makes a new password for a teacher and shows it once', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Parolă nouă: Bogdan' }));
    expect(api.resetPassword).toHaveBeenCalledWith(3);
    expect(await screen.findByText(FAKE_TEMPORARY_PASSWORD)).toBeInTheDocument();
  });

  it('offers no account changes and no new password for an administrator, oneself included', async () => {
    renderAdmin('/setari', withAccounts());
    await section('Profesori');
    expect(screen.getByText('Mihai (mihai@example.com)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Laura Miron/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mihai/ })).not.toBeInTheDocument();
  });
});
