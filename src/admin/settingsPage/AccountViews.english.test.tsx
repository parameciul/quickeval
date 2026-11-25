import '../../test/english.ts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fakeAccount } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

describe('the administrators\' views on Detalii, in English', () => {
  it('names the part, its columns and how each view ended', async () => {
    const laura = fakeAccount();
    const bogdan = fakeAccount({ id: 3, name: 'Bogdan', email: 'bogdan@example.com', role: 'teacher' });
    const base = await createFakeApi({ classes: [], students: {}, accounts: [structuredClone(bogdan)] }).getAccount(3);
    const views = [
      { admin: { id: 1, name: 'Laura Miron' }, startedAt: '2026-11-25T10:00:00.000Z', endedAt: '2026-11-25T10:20:00.000Z', endReason: 'exit' as const },
      { admin: null, startedAt: '2026-11-25T12:00:00.000Z', endedAt: null, endReason: null },
    ];
    renderAdmin(
      '/settings',
      createFakeApi({ classes: [], students: {}, accounts: [structuredClone(laura), structuredClone(bogdan)], accountDetails: { 3: { ...base, views } } }),
    );
    const all = await screen.findByRole('region', { name: 'All accounts' });
    await userEvent.click(within(all).getByRole('button', { name: 'Details for Bogdan' }));
    const heading = await screen.findByRole('heading', { name: 'Administrator views' });
    const rows = within(heading.closest('div')!.querySelector('table')!).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('AdministratorStartedEndedHow it ended');
    expect(rows[1]).toHaveTextContent('Exited');
    expect(rows[2]).toHaveTextContent('in progress');
  });
});
