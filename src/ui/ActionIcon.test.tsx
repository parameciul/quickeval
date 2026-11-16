import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACTION_ICON_NAMES, ActionIcon, actionIconFor } from './ActionIcon.tsx';

describe('ActionIcon', () => {
  it('draws every icon as a hidden line drawing in the text colour', () => {
    for (const name of ACTION_ICON_NAMES) {
      const { container, unmount } = render(<ActionIcon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg).toHaveClass('action-icon');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('viewBox', '0 0 20 20');
      expect(svg!.children.length, name).toBeGreaterThan(0);
      unmount();
    }
  });

  it('leaves the name of its button to the words beside it', () => {
    render(
      <button type="button">
        <ActionIcon name="download" />
        Descarcă PDF
      </button>,
    );
    expect(screen.getByRole('button', { name: 'Descarcă PDF' })).toBeInTheDocument();
  });
});

describe('actionIconFor', () => {
  it('gives each next step and task its verb’s icon', () => {
    expect(actionIconFor('Încarcă testul')).toBe('upload');
    expect(actionIconFor('Încarcă baremul CES')).toBe('upload');
    expect(actionIconFor('Generează din nou baremul')).toBe('generate');
    expect(actionIconFor('Verifică baremul')).toBe('search');
    expect(actionIconFor('Verifică 3 puncte')).toBe('search');
    expect(actionIconFor('Deschide')).toBe('open');
    expect(actionIconFor('Începe testul')).toBe('play');
    expect(actionIconFor('Începe')).toBe('play');
    expect(actionIconFor('Pornește corectarea')).toBe('play');
    expect(actionIconFor('Oprește accesul')).toBe('eye-off');
    expect(actionIconFor('Publică rezultatele')).toBe('eye');
    expect(actionIconFor('Publică pentru toți')).toBe('eye');
    expect(actionIconFor('Raportul clasei')).toBe('report');
  });

  it('falls back to the arrow for words it does not know', () => {
    expect(actionIconFor('Altceva')).toBe('arrow');
    expect(actionIconFor('')).toBe('arrow');
    expect(actionIconFor('încarcă testul')).toBe('arrow');
  });
});
