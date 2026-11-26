import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SortHeader, SortSelect } from './TableSort.tsx';

describe('SortSelect', () => {
  it("offers a phone's orders and gives the one picked", async () => {
    const onSort = vi.fn();
    render(<SortSelect table="papers" sort={{ key: 'name', dir: 'asc' }} onSort={onSort} columns={{ grade: 'Nota' }} />);
    const select = screen.getByRole('combobox', { name: 'Ordine' });
    expect(select).toHaveValue('name-asc');
    await userEvent.selectOptions(select, 'Nota (mare → mică)');
    expect(onSort).toHaveBeenCalledWith({ key: 'grade', dir: 'desc' });
  });

  it('shows an order picked on a computer that the list does not offer', () => {
    render(<SortSelect table="papers" sort={{ key: 'files', dir: 'asc' }} onSort={() => {}} columns={{ files: 'Fișiere' }} />);
    expect(screen.getByRole('combobox', { name: 'Ordine' })).toHaveDisplayValue('Fișiere ↑');
  });

  it('has its own orders for Rezultate', () => {
    render(<SortSelect table="results" sort={{ key: 'name', dir: 'asc' }} onSort={() => {}} columns={{}} />);
    expect(screen.getByRole('option', { name: 'Publicate întâi' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Stare' })).not.toBeInTheDocument();
  });
});

describe('SortHeader', () => {
  const table = (cards: boolean) => (
    <table>
      <thead>
        <tr>
          <SortHeader label="Nota" sortKey="grade" sort={{ key: 'grade', dir: 'desc' }} onSort={() => {}} cards={cards} />
        </tr>
      </thead>
    </table>
  );

  it('is a button with the order on a computer', () => {
    render(table(false));
    expect(screen.getByRole('columnheader', { name: 'Nota' })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('button', { name: 'Nota' })).toHaveClass('is-on');
  });

  it('is plain text among the hidden column names of the cards', () => {
    render(table(true));
    expect(screen.getByRole('columnheader', { name: 'Nota' })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
