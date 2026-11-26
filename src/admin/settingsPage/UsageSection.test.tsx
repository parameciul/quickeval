import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EMPTY_USAGE } from '../../../shared/usage.ts';
import { ApiError } from '../../ui/ApiError.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { usageKeyLabel } from './UsageSection.tsx';

const usage = {
  totals: { ...EMPTY_USAGE, papers: 12, barems: 2, tokens: 1234567, tries: 3, failed: 1, backupJobs: 2 },
  rows: [
    { key: '2026-11-18', ...EMPTY_USAGE, papers: 8, barems: 2, tokens: 1000000, tries: 3, backupJobs: 2 },
    { key: '2026-11-17', ...EMPTY_USAGE },
    { key: '2026-11-16', ...EMPTY_USAGE, papers: 4, failed: 1, tokens: 234567 },
  ],
};

const open = async (api = createFakeApi({ classes: [], students: {}, usage })) => {
  renderAdmin('/settings?tab=stats', api);
  await screen.findByRole('heading', { name: 'Statistici de utilizare' });
  return api;
};

const generate = () => userEvent.click(screen.getByRole('button', { name: 'Generează' }));

describe('Statistici on Setări', () => {
  it('reads nothing until Generează, then asks for all the work of the last 7 days', async () => {
    const api = await open();
    expect(api.getUsage).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Toate' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Perioada' })).toHaveValue('7d');
    await generate();
    expect(api.getUsage).toHaveBeenCalledWith('all', '7d');
    expect(await screen.findByRole('heading', { name: 'Ultimele 7 zile · Toate' })).toBeInTheDocument();
  });

  it('shows the totals and one row per day, with a dash for nothing', async () => {
    await open();
    await generate();
    const totals = await screen.findByLabelText('Totaluri');
    expect(totals).toHaveTextContent('Lucrări12');
    expect(totals).toHaveTextContent('Tokeni1.234.567');
    expect(totals).toHaveTextContent('Încercări3');
    expect(totals).toHaveTextContent('Cont de rezervă2');
    const table = screen.getByRole('table', { name: 'Ultimele 7 zile · Toate' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Ziua', 'Lucrări', 'Bareme', 'Liste', 'Analize', 'Tipar', 'Eșuate', 'Tokeni', 'Încercări', 'Cont de rezervă',
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['18 nov.', '17 nov.', '16 nov.']);
    expect(within(rows[0]!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['8', '2', '—', '—', '—', '—', '1.000.000', '3', '2']);
    expect(within(rows[1]!).getAllByRole('cell').every((cell) => cell.textContent === '—')).toBe(true);
  });

  it('draws the papers of each day as a bar, the busiest day full width', async () => {
    await open();
    await generate();
    const table = await screen.findByRole('table');
    const bars = [...table.querySelectorAll<HTMLElement>('.usage-bar')];
    expect(bars.map((bar) => bar.style.inlineSize)).toEqual(['100%', '0%', '50%']);
    expect(bars.every((bar) => bar.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('leaves out the tries for the teachers, and asks for the year by month', async () => {
    const api = await open();
    await userEvent.click(screen.getByRole('radio', { name: 'Profesori' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Perioada' }), 'Ultimul an');
    await generate();
    expect(api.getUsage).toHaveBeenCalledWith('teachers', '12m');
    const table = await screen.findByRole('table', { name: 'Ultimul an · Profesori' });
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers[0]).toBe('Luna');
    expect(headers).not.toContain('Încercări');
    expect(headers).not.toContain('Cont de rezervă');
    expect(screen.getByLabelText('Totaluri')).not.toHaveTextContent('Încercări');
    expect(screen.getByLabelText('Totaluri')).not.toHaveTextContent('Cont de rezervă');
  });

  it('asks again on each Generează, also for the same choice', async () => {
    const api = await open();
    await generate();
    await screen.findByRole('table');
    await generate();
    await screen.findByRole('table');
    expect(api.getUsage).toHaveBeenCalledTimes(2);
  });

  it('keeps Generează usable while it works, asks once, then takes the focus to the result', async () => {
    const api = createFakeApi({ classes: [], students: {}, usage });
    let answer!: (stats: Awaited<ReturnType<typeof api.getUsage>>) => void;
    api.getUsage.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await open(api);
    const button = screen.getByRole('button', { name: 'Generează' });
    await generate();
    expect(await screen.findByText('Se generează…')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    await generate();
    expect(api.getUsage).toHaveBeenCalledTimes(1);
    answer({ source: 'all', period: '7d', ...usage });
    const heading = await screen.findByRole('heading', { name: 'Ultimele 7 zile · Toate' });
    expect(heading).toHaveFocus();
  });

  it('shows the message of a refusal', async () => {
    const api = createFakeApi({ classes: [], students: {} });
    api.getUsage.mockRejectedValueOnce(new ApiError(400, 'invalid', 'Statistica cerută nu este validă.'));
    await open(api);
    await generate();
    expect(await screen.findByText('Statistica cerută nu este validă.')).toBeInTheDocument();
  });
});

describe('usageKeyLabel', () => {
  it('names a day and a month in Romanian', () => {
    expect(usageKeyLabel('2026-11-18')).toBe('18 nov.');
    expect(usageKeyLabel('2026-01-01')).toBe('1 ian.');
    expect(usageKeyLabel('2026-11')).toBe('nov. 2026');
  });
});
