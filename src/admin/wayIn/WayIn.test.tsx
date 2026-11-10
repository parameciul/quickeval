import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import landing from '../../../index.html?raw';
import { PITCH_HEADING, PITCH_LINE, STAGES, STAGES_TITLE, WayIn } from './WayIn.tsx';

describe('the way in', () => {
  it('says what the landing page says, word for word', () => {
    expect(landing).toContain(`<h1 class="l-h1" id="titlu">${PITCH_HEADING}</h1>`);
    expect(landing).toContain(`<p class="l-lede">${PITCH_LINE}</p>`);
    expect(landing).toContain(`<h2>${STAGES_TITLE}</h2>`);
    const landingStages = [...landing.matchAll(/<h3>([^<]+) <span class="who-tag">([^<]+)<\/span><\/h3><p>(.+?)<\/p>/g)];
    expect(landingStages.map((match) => [match[1], match[2], match[3]])).toEqual(
      STAGES.map((stage) => [stage.name, stage.who, stage.lead === undefined ? stage.text : `<b>${stage.lead}</b> ${stage.text}`]),
    );
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
