import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import landing from '../../../index.html?raw';
import { PITCH_HEADING, PITCH_LINE, WayIn } from './WayIn.tsx';

describe('the way in', () => {
  it("keeps the landing page's heading and Laura Miron's line, word for word", () => {
    // The landing page tells the day of a test in its own way; the login keeps
    // the six stages, and shares the heading and the line with it.
    expect(landing).toMatch(new RegExp(`<h1 id="title"[^>]*>${PITCH_HEADING}</h1>`));
    expect(landing).toContain(`<p class="l-lede rise">${PITCH_LINE}</p>`);
  });

  it('shows the form, the six stages and the legend, the teacher\'s stages marked', () => {
    render(
      <WayIn>
        <h1>Intră în cont</h1>
      </WayIn>,
    );
    const pitch = screen.getByRole('region', { name: PITCH_HEADING });
    const items = within(pitch).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'Pregătire Tu',
      'Tipărire Tu',
      'În clasă Elevii',
      'Corectare MQGrader',
      'Verificare Tu',
      'Rezultate Tu',
    ]);
    expect(items.filter((item) => item.classList.contains('is-you'))).toHaveLength(4);
    expect(pitch).toHaveTextContent('Tu faci 4 din 6 etape, câteva minute fiecare. Restul se fac singure.');
    expect(within(screen.getByRole('region', { name: 'Contul tău' })).getByRole('heading', { level: 1 })).toHaveTextContent('Intră în cont');
  });
});
