import '../../test/english.ts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeAccount } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { viewTab } from '../shell/viewing.ts';

describe('Vezi ca, in English', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('names the item, the dialog and the notice', async () => {
    const ana = fakeAccount({ id: 2, name: 'Ana Pop', email: 'ana@example.com', role: 'teacher', status: 'active' });
    const api = createFakeApi({ classes: [], students: {}, accounts: [fakeAccount(), structuredClone(ana)] });
    vi.spyOn(viewTab, 'leave').mockImplementation(() => {});
    renderAdmin('/settings', api);
    await userEvent.click(await screen.findByRole('button', { name: 'More for Ana Pop' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'View as Ana Pop' }));
    const dialog = await screen.findByRole('dialog', { name: "View Ana Pop's account" });
    expect(within(dialog).getByText("To view Ana Pop's account, type your password.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'parola');
    await userEvent.click(within(dialog).getByRole('button', { name: 'View the account' }));
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(api.startView).toHaveBeenCalledWith(2, 'parola');
  });

  it('says that a view ended', async () => {
    window.sessionStorage.setItem('quickeval.viewEnded', 'Ana Pop');
    renderAdmin('/settings', createFakeApi({ classes: [], students: {} }));
    expect(await screen.findByRole('status')).toHaveTextContent("The view of Ana Pop's account has ended.");
  });
});
