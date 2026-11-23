import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import landing from '../../../index.html?raw';
import { PITCH_HEADING, PITCH_LINE, STAGES, WayIn } from './WayIn.tsx';

describe('the way in', () => {
  it("keeps the landing page's heading and Laura Miron's line, word for word", () => {
    // The landing page tells the day of a test in its own way; the login keeps
    // the six stages, and shares the heading and the line with it.
    expect(landing).toMatch(new RegExp(`<h1 id="title"[^>]*>${PITCH_HEADING}</h1>`));
    expect(landing).toContain(`<p class="l-lede rise">${PITCH_LINE}</p>`);
  });

  it("names who does each stage as the landing page's day does", () => {
    // The day has five rows: Monday is Pregătire, each other row one stage.
    // Tipărire, between them, is the teacher's alone.
    const doc = new DOMParser().parseFromString(landing, 'text/html');
    const rows = [...doc.querySelectorAll('.clock .whos')].map((w) => [...w.querySelectorAll('.who')].map((s) => s.textContent));
    expect(rows).toHaveLength(5);
    expect(STAGES.map((stage) => stage.who)).toEqual([rows[0], ['Tu'], rows[1], rows[2], rows[3], rows[4]]);
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
      'Pregătire Tu MQGrader',
      'Tipărire Tu',
      'În clasă Elevii',
      'Corectare Tu MQGrader',
      'Verificare Tu',
      'Rezultate MQGrader Tu Elevii',
    ]);
    expect(items.filter((item) => item.classList.contains('is-you'))).toHaveLength(5);
    expect(pitch).toHaveTextContent('Tu: câteva minute la fiecare etapă. Restul îl fac elevii și MQGrader.');
    expect(within(screen.getByRole('region', { name: 'Contul tău' })).getByRole('heading', { level: 1 })).toHaveTextContent('Intră în cont');
  });
});
