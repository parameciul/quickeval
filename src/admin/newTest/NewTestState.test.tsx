import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewTestState } from './NewTestState.tsx';

describe('NewTestState', () => {
  it('lists what the new test has and what it misses', () => {
    render(<NewTestState hasClass hasTitle missing={['test', 'barem']} wantsCes={false} />);
    const card = screen.getByRole('region', { name: 'Starea testului' });
    expect(card).toHaveTextContent('2 din 4 făcute');
    const rows = within(card).getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual(['Clasagata', 'Titlulgata', 'Testullipsește', 'Baremullipsește']);
  });

  it('asks for the class and the title first, and counts the CES parts when they are wanted', () => {
    render(<NewTestState hasClass={false} hasTitle={false} missing={['barem']} wantsCes />);
    const card = screen.getByRole('region', { name: 'Starea testului' });
    expect(card).toHaveTextContent('3 din 6 făcute');
    expect(within(card).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Clasade ales',
      'Titlulde scris',
      'Testulgata',
      'Baremullipsește',
      'Testul CESgata',
      'Baremul CESgata',
    ]);
  });
});
