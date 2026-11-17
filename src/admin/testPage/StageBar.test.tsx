import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Stage } from '../stages.ts';
import { nextStageName, StageBar } from './StageBar.tsx';

const stages = (overrides: Partial<Record<Stage['name'], Pick<Stage, 'state' | 'note'>>> = {}): Stage[] =>
  (['Pregătire', 'Tipărire', 'În clasă', 'Corectare', 'Verificare', 'Rezultate'] as const).map((name) => ({
    name,
    state: 'done' as const,
    note: '',
    ...overrides[name],
  }));

function bar(chosen: Stage['name'], list: Stage[]) {
  return render(
    <MemoryRouter>
      <StageBar stages={list} chosen={chosen} />
    </MemoryRouter>,
  );
}

describe('StageBar', () => {
  it('names the stage on show and leads to the next one', () => {
    bar('Corectare', stages());
    const nav = screen.getByRole('navigation', { name: 'Etapa următoare' });
    expect(nav).toHaveTextContent('Corectare · gata');
    const link = screen.getByRole('link', { name: 'Mergi la Verificare' });
    expect(link).toHaveAttribute('href', '/#review');
    // A quiet outline: the filled blue is for the panel's own main action.
    expect(link).toHaveClass('button', 'button-small');
    expect(link).not.toHaveClass('button-quiet');
    expect(link).not.toHaveClass('button-wait');
  });

  it('turns orange and says what waits when the next stage waits on the teacher', () => {
    bar('Corectare', stages({ Verificare: { state: 'wait', note: '47 de puncte nesigure' } }));
    expect(screen.getByText('47 de puncte nesigure')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Mergi la Verificare' });
    expect(link).toHaveClass('button', 'button-small', 'button-wait');
    expect(link).not.toHaveClass('button-quiet');
  });

  it('says a stage in progress is in progress, with no tick', () => {
    bar('Tipărire', stages({ Tipărire: { state: 'now', note: 'se pregătește' } }));
    expect(screen.getByRole('navigation', { name: 'Etapa următoare' })).toHaveTextContent('Tipărire · în lucru');
    expect(screen.getByRole('link', { name: 'Mergi la etapa În clasă' })).toBeInTheDocument();
  });

  it('says the stage on show waits on the teacher, with no tick, and stays quiet when the next stage does not wait', () => {
    bar('Verificare', stages({ Verificare: { state: 'wait', note: '3 puncte nesigure' }, Rezultate: { state: 'later', note: '' } }));
    const nav = screen.getByRole('navigation', { name: 'Etapa următoare' });
    expect(nav).toHaveTextContent('Verificare · te așteaptă');
    expect(nav.querySelector('.stage-bar-state')).not.toHaveClass('is-done');
    expect(nav.querySelector('.stage-bar-mark svg')).toBeNull();
    expect(nav.querySelector('.stage-bar-wait')).toBeNull();
    const link = screen.getByRole('link', { name: 'Mergi la Rezultate' });
    expect(link).toHaveClass('button', 'button-small');
    expect(link).not.toHaveClass('button-wait');
  });

  it('is not drawn after the last stage', () => {
    const { container } = bar('Rezultate', stages());
    expect(container).toBeEmptyDOMElement();
    expect(nextStageName('Rezultate')).toBeUndefined();
    expect(nextStageName('Verificare')).toBe('Rezultate');
  });
});
