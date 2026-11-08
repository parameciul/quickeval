import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_TEMPORARY_PASSWORD, fakeAccount } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { accountKind, accountUse } from './AccountsSection.tsx';

const laura = fakeAccount();
const ana = fakeAccount({ id: 2, name: 'Ana Pop', email: 'ana@example.com', role: 'teacher', demo: true, status: 'pending' });
const bogdan = fakeAccount({ id: 3, name: 'Bogdan', email: 'bogdan@example.com', role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 20 });

const mihai = fakeAccount({ id: 4, name: 'Mihai', email: 'mihai@example.com', role: 'admin' });

const withAccounts = () =>
  createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(laura), structuredClone(bogdan), structuredClone(mihai)] });

afterEach(() => {
  vi.restoreAllMocks();
});

const card = (name: string | RegExp) => screen.findByRole('region', { name });
const row = (within_: HTMLElement, name: string) => within(within_).getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;

// Opens ⋯ of a teacher's row and picks an item.
async function pick(name: string, item: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Mai multe pentru ${name}` }));
  await userEvent.click(screen.getByRole('menuitem', { name: item }));
}

describe('the accounts on Setări', () => {
  it('lists the accounts that wait in their own card, and approves one', async () => {
    const api = withAccounts();
    renderAdmin('/setari', api);
    const waiting = await card('1 cont așteaptă aprobarea');
    const line = row(waiting, 'Ana Pop');
    expect(line).toHaveTextContent('ana@example.com');
    expect(line).toHaveTextContent('6 oct. 2026, 11:00');
    expect(within(line).getByText('confirmat')).toHaveClass('tag-ok');
    expect(waiting).toHaveTextContent('Un cont aprobat este un cont demo: un test, cel mult 35 de lucrări. Îl faci complet din lista de mai jos.');
    await userEvent.click(within(waiting).getByRole('button', { name: 'Aprobă Ana Pop' }));
    expect(api.approveAccount).toHaveBeenCalledWith(2, ana.createdAt);
    expect(await within(await card('Toate conturile')).findByRole('rowheader', { name: /^Ana Pop/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument();
    // The card went with the focused button: the focus moves to the list.
    expect(screen.getByRole('heading', { name: 'Toate conturile' })).toHaveFocus();
  });

  it('names its tables after their cards', async () => {
    renderAdmin('/setari', withAccounts());
    expect(await screen.findByRole('table', { name: '1 cont așteaptă aprobarea' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Toate conturile' })).toBeInTheDocument();
  });

  it('keeps the focus in the card when one of several waiting accounts is approved', async () => {
    const carmen = fakeAccount({ id: 5, name: 'Carmen', email: 'carmen@example.com', role: 'teacher', demo: true, status: 'pending' });
    renderAdmin('/setari', createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(carmen), structuredClone(laura)] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobă Ana Pop' }));
    expect(await screen.findByRole('heading', { name: '1 cont așteaptă aprobarea' })).toHaveFocus();
  });

  it('refuses an account after a confirmation', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Refuză Ana Pop' }));
    expect(api.rejectAccount).toHaveBeenCalledWith(2, ana.createdAt);
    await screen.findByRole('region', { name: 'Toate conturile' });
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument());
  });

  it('refuses every account that waits at once, after a confirmation', async () => {
    const carmen = fakeAccount({ id: 5, name: 'Carmen', email: 'carmen@example.com', role: 'teacher', demo: true, status: 'pending' });
    const api = createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(carmen), structuredClone(laura)] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    const waiting = await card('2 conturi așteaptă aprobarea');
    await userEvent.click(within(waiting).getByRole('button', { name: 'Refuză toate' }));
    expect(confirm).toHaveBeenCalledWith('Refuzi toate cele 2 conturi care așteaptă? Cererile se șterg.');
    expect(api.rejectAllAccounts).toHaveBeenCalledWith([
      { id: 2, createdAt: ana.createdAt },
      { id: 5, createdAt: carmen.createdAt },
    ]);
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument());
  });

  it('offers no "Refuză toate" for a single account that waits', async () => {
    renderAdmin('/setari', withAccounts());
    await screen.findByRole('button', { name: 'Aprobă Ana Pop' });
    expect(screen.queryByRole('button', { name: 'Refuză toate' })).not.toBeInTheDocument();
  });

  it('shows no card of waiting accounts when none waits', async () => {
    renderAdmin('/setari', createFakeApi({ classes: [], students: {}, accounts: [structuredClone(laura), structuredClone(bogdan)] }));
    expect(await card('Toate conturile')).toHaveTextContent('2 conturi');
    expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument();
  });

  it('shows the kind of each account and what it used, and makes a demo account complete', async () => {
    const api = withAccounts();
    renderAdmin('/setari', api);
    const all = await card('Toate conturile');
    expect(all).toHaveTextContent('3 conturi');
    expect(row(all, 'Laura Miron')).toHaveTextContent('administrator');
    expect(row(all, 'Laura Miron')).toHaveTextContent('0 teste · 0 lucrări');
    expect(within(row(all, 'Bogdan')).getByText('demo')).toHaveClass('tag');
    expect(row(all, 'Bogdan')).toHaveTextContent('1 test · 20 din 35 de lucrări');
    await pick('Bogdan', 'Fă cont complet');
    expect(api.updateAccount).toHaveBeenCalledWith(3, { demo: false });
    expect(await within(all).findByText('complet')).toHaveClass('tag-ok');
    expect(row(all, 'Bogdan')).toHaveTextContent('1 test · 20 de lucrări');
    expect(screen.getByRole('button', { name: 'Mai multe pentru Bogdan' })).toHaveFocus();
  });

  it('closes an account after a confirmation, and opens it again', async () => {
    const api = withAccounts();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Închide contul');
    expect(confirm).toHaveBeenCalledWith('Închizi contul lui Bogdan? Nu va mai putea intra, dar datele rămân.');
    expect(api.updateAccount).toHaveBeenCalledWith(3, { status: 'disabled' });
    const all = await card('Toate conturile');
    expect(await within(all).findByText('închis')).toBeInTheDocument();
    expect(row(all, 'Bogdan')).toHaveClass('is-muted');
    await userEvent.click(screen.getByRole('button', { name: 'Mai multe pentru Bogdan' }));
    expect(screen.queryByRole('menuitem', { name: 'Închide contul' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Fă cont/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Redeschide contul' }));
    expect(api.updateAccount).toHaveBeenLastCalledWith(3, { status: 'active' });
    expect(await within(row(all, 'Bogdan')).findByText('demo')).toBeInTheDocument();
    expect(row(all, 'Bogdan')).not.toHaveClass('is-muted');
    expect(screen.getByRole('button', { name: 'Mai multe pentru Bogdan' })).toHaveFocus();
  });

  it('gives the focus back to ⋯ before it asks', async () => {
    let focused: string | null = null;
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      focused = document.activeElement?.getAttribute('aria-label') ?? null;
      return false;
    });
    renderAdmin('/setari', withAccounts());
    await pick('Bogdan', 'Parolă nouă');
    expect(focused).toBe('Mai multe pentru Bogdan');
  });

  it('keeps an account open when the closing is not confirmed', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Închide contul');
    expect(api.updateAccount).not.toHaveBeenCalled();
  });

  it('makes a new password for a teacher and shows it once, under the row', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Parolă nouă');
    expect(api.resetPassword).toHaveBeenCalledWith(3);
    const all = await card('Toate conturile');
    const under = row(all, 'Bogdan').nextElementSibling as HTMLElement;
    expect(await within(under).findByRole('status')).toHaveTextContent(`Parola nouă a lui Bogdan: ${FAKE_TEMPORARY_PASSWORD}`);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps a new password while the teacher looks at another tab', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', withAccounts());
    await pick('Bogdan', 'Parolă nouă');
    expect(await screen.findByText(FAKE_TEMPORARY_PASSWORD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Robotul' }));
    await userEvent.click(screen.getByRole('tab', { name: /^Conturi/ }));
    expect(screen.getByText(FAKE_TEMPORARY_PASSWORD)).toBeVisible();
  });

  it('closes ⋯ on Esc and gives the focus back to it', async () => {
    renderAdmin('/setari', withAccounts());
    const more = await screen.findByRole('button', { name: 'Mai multe pentru Bogdan' });
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('offers no ⋯ for an administrator, oneself included', async () => {
    renderAdmin('/setari', withAccounts());
    const all = await card('Toate conturile');
    expect(row(all, 'Mihai')).toHaveTextContent('mihai@example.com');
    expect(within(all).queryByRole('button', { name: /Laura Miron/ })).not.toBeInTheDocument();
    expect(within(all).queryByRole('button', { name: /Mihai/ })).not.toBeInTheDocument();
  });
});

describe('accountKind and accountUse', () => {
  it.each([
    [fakeAccount({ role: 'teacher', testsEvaluated: 1, papersGraded: 1 }), 'complet', '1 test · 1 lucrare'],
    [fakeAccount({ role: 'teacher', testsEvaluated: 7, papersGraded: 19 }), 'complet', '7 teste · 19 lucrări'],
    [fakeAccount({ role: 'teacher', testsEvaluated: 51, papersGraded: 900 }), 'complet', '51 de teste · 900 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, testsEvaluated: 0, papersGraded: 0 }), 'demo', '0 teste · 0 din 35 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, testsEvaluated: 3, papersGraded: 40 }), 'demo', '3 teste · 35 din 35 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, status: 'disabled', testsEvaluated: 1, papersGraded: 2 }), 'închis', '1 test · 2 lucrări'],
    [fakeAccount({ testsEvaluated: 4, papersGraded: 88 }), 'administrator', '4 teste · 88 de lucrări'],
  ])('describes %j', (account, kind, use) => {
    expect(accountKind(account).label).toBe(kind);
    expect(accountUse(account)).toBe(use);
  });
});
