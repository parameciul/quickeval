import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewTestState } from './NewTestState.tsx';

describe('NewTestState', () => {
  it('lists what the new test has and what it misses', () => {
    render(<NewTestState hasClass hasTitle missing={['test', 'barem']} generating={[]} phone={[]} wantsCes={false} />);
    const card = screen.getByRole('region', { name: 'Starea testului' });
    expect(card).toHaveTextContent('2 din 4 făcute');
    const rows = within(card).getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual(['Clasagata', 'Titlulgata', 'Testullipsește', 'Baremullipsește']);
  });

  it('asks for the class and the title first, and counts the CES parts when they are wanted', () => {
    render(<NewTestState hasClass={false} hasTitle={false} missing={['barem']} generating={[]} phone={[]} wantsCes />);
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

  it('says a barem the robot will write comes later, and does not count it as done', () => {
    render(<NewTestState hasClass hasTitle missing={[]} generating={['barem']} phone={[]} wantsCes={false} />);
    const card = screen.getByRole('region', { name: 'Starea testului' });
    expect(card).toHaveTextContent('3 din 4 făcute');
    const rows = within(card).getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual(['Clasagata', 'Titlulgata', 'Testulgata', 'Baremulse va genera']);
  });

  it('says a part chosen from the phone comes from it, neither done nor missing', () => {
    render(<NewTestState hasClass hasTitle missing={[]} generating={['barem']} phone={['test']} wantsCes={false} />);
    const card = screen.getByRole('region', { name: 'Starea testului' });
    expect(card).toHaveTextContent('2 din 4 făcute');
    const rows = within(card).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['Clasagata', 'Titlulgata', 'Testulde pe telefon', 'Baremulse va genera']);
    expect(rows[2]).toHaveClass('is-phone');
  });
});
