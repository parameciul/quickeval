import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { apiWith, PAGE } from '../pages/testPageTestKit.tsx';

const files = { test: { name: 'test.pdf', type: 'application/pdf' }, barem: null };

describe('Pregătire: the test and the barem from the phone', () => {
  it('offers "Fă poze cu telefonul" while a file misses, and shows the QR code of a new link with what it takes', async () => {
    const api = apiWith({ files });
    renderAdmin(`${PAGE}#prepare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Fă poze cu telefonul' }));
    expect(api.createPhoneLink).toHaveBeenCalledWith('6E2-26T1');
    const dialog = await screen.findByRole('dialog', { name: 'Fă pozele cu telefonul' });
    expect(within(dialog).getAllByRole('listitem').map((row) => row.textContent)).toEqual(['BaremulAșteaptă pozele']);
    expect(within(dialog).getByText('Codul merge 24 de ore. Îl faci din nou la Pregătire: „Fă poze cu telefonul”.')).toBeInTheDocument();
  });

  it('offers nothing once the test and the barem are there', async () => {
    renderAdmin(`${PAGE}#prepare`, apiWith({ files: { ...files, barem: { name: 'barem.pdf', type: 'application/pdf' } } }));
    expect(await screen.findByText('Testul și baremul sunt gata')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fă poze cu telefonul' })).not.toBeInTheDocument();
  });

  it('says a barem from the test that was not asked for once its test arrived', async () => {
    const api = apiWith({ files: { test: { name: 'Testul.pdf', type: 'application/pdf' }, barem: null } });
    renderAdmin({ pathname: PAGE, state: { phone: { token: 'p'.repeat(40), ask: { parts: ['test'], fromTest: ['barem'] } } } }, api);
    const dialog = await screen.findByRole('dialog', { name: 'Fă pozele cu telefonul' });
    expect(within(dialog).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'TestulA ajuns',
      'BaremulNu s-a cerut: îl generezi la Pregătire',
    ]);
  });

  it('opens the window Test nou asked for, once: closed, it stays closed', async () => {
    const api = apiWith({ files: { test: null, barem: null } });
    renderAdmin({ pathname: `${PAGE}`, state: { phone: { token: 'p'.repeat(40), ask: { parts: ['test'], fromTest: ['barem'] } } } }, api);
    const dialog = await screen.findByRole('dialog', { name: 'Fă pozele cu telefonul' });
    expect(within(dialog).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'TestulAșteaptă pozele',
      'BaremulSe face din test, după ce ajunge testul',
    ]);
    expect(api.createPhoneLink).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Închide' }).at(-1)!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
